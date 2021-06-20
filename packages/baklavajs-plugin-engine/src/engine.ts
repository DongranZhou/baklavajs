import { BaklavaEvent, PreventableBaklavaEvent, SequentialHook } from "@baklavajs/events";
import { Connection, AbstractNode, NodeInterface, IConnection, GRAPH_NODE_TYPE_PREFIX, Editor } from "@baklavajs/core";
import { Mutex } from "async-mutex";
import { calculateOrder, containsCycle, expandGraph, IOrderCalculationResult } from "./nodeTreeBuilder";

export class Engine {
    public type = "EnginePlugin";

    public events = {
        /** This event will be called before all the nodes `calculate` functions are called.
         * The argument is the calculationData that the nodes will receive
         */
        beforeCalculate: new PreventableBaklavaEvent<any, Engine>(this),
        calculated: new BaklavaEvent<Map<AbstractNode, any>, Engine>(this),
    };

    public hooks = {
        gatherCalculationData: new SequentialHook<any, Engine>(this),
    };

    private editor: Editor;
    private orderCalculationData?: IOrderCalculationResult;
    private recalculateOrder = false;
    private calculateOnChange = false;
    private calculationInProgress = false;
    private mutex = new Mutex();
    private _rootNodes: AbstractNode[] | undefined = undefined;

    public get rootNodes(): AbstractNode[] | undefined {
        return this._rootNodes;
    }

    public set rootNodes(value: AbstractNode[] | undefined) {
        this._rootNodes = value;
        this.recalculateOrder = true;
    }

    /**
     * Construct a new Engine plugin
     * @param calculateOnChange Whether to automatically calculate all nodes when any node interface is changed.
     */
    public constructor(editor: Editor, calculateOnChange = false) {
        this.editor = editor;
        this.calculateOnChange = calculateOnChange;

        this.editor.nodeEvents.update.subscribe(this, (data, node) => {
            if (node.type.startsWith(GRAPH_NODE_TYPE_PREFIX) && data === null) {
                this.onChange(true);
            } else {
                this.onChange(false);
            }
        });

        this.editor.graphEvents.addNode.subscribe(this, () => {
            this.onChange(true);
        });

        this.editor.graphEvents.removeNode.subscribe(this, () => {
            this.onChange(true);
        });

        this.editor.graphEvents.checkConnection.subscribe(this, (c) => {
            if (!this.checkConnection(c.from, c.to)) {
                return false;
            }
        });

        this.editor.graphEvents.addConnection.subscribe(this, (c, graph) => {
            // as only one connection to an input interface is allowed
            // Delete all other connections to the target interface
            graph.connections
                .filter((conn) => conn.from !== c.from && conn.to === c.to)
                .forEach((conn) => graph.removeConnection(conn));

            this.onChange(true);
        });

        this.editor.graphEvents.removeConnection.subscribe(this, () => {
            this.onChange(true);
        });
    }

    /**
     * Calculate all nodes.
     * This will automatically calculate the node calculation order if necessary and
     * transfer values between connected node interfaces.
     * @returns A promise that resolves to either
     * - a map that maps rootNodes to their calculated value (what the calculation function of the node returned)
     * - null if the calculation was prevented from the beforeCalculate event
     */
    public async calculate(calculationData?: any): Promise<Map<AbstractNode, any> | null> {
        return await this.mutex.runExclusive(async () => await this.internalCalculate(calculationData));
    }

    /**
     * Force the engine to recalculate the node execution order.
     * This is normally done automatically. Use this method if the
     * default change detection does not work in your scenario.
     */
    public calculateOrder() {
        this.calculateNodeTree();
        this.recalculateOrder = false;
    }

    private async internalCalculate(calculationData?: any): Promise<Map<AbstractNode, any> | null> {
        if (this.events.beforeCalculate.emit(calculationData)) {
            return null;
        }
        calculationData = this.hooks.gatherCalculationData.execute(calculationData);

        this.calculationInProgress = true;
        if (this.recalculateOrder || !this.orderCalculationData) {
            this.calculateOrder();
        }

        const { calculationOrder, rootNodes, connectionsFromNode } = this.orderCalculationData!;

        const results: Map<AbstractNode, any> = new Map();
        for (const n of calculationOrder) {
            if (!n.calculate) {
                continue;
            }
            const inputs: Record<string, any> = {};
            Object.entries(n.inputs).forEach(([k, v]) => {
                inputs[k] = v.value;
            });
            const r = await n.calculate(inputs, calculationData);
            if (typeof r === "object") {
                Object.entries(r).forEach(([k, v]) => {
                    if (n.outputs[k]) {
                        n.outputs[k].value = v;
                    }
                });
            }
            if (rootNodes.includes(n)) {
                results.set(n, r);
            }
            if (connectionsFromNode.has(n)) {
                connectionsFromNode.get(n)!.forEach((c) => {
                    c.to.value = (c as Connection).hooks.transfer.execute(c.from.value);
                });
            }
        }
        this.calculationInProgress = false;
        this.events.calculated.emit(results);
        return results;
    }

    private checkConnection(from: NodeInterface, to: NodeInterface): boolean {
        const { nodes, connections } = expandGraph(this.editor.graph);

        if (from.templateId) {
            const newFrom = this.findInterfaceByTemplateId(nodes, from.templateId);
            if (!newFrom) {
                return true;
            }
            from = newFrom;
        }

        if (to.templateId) {
            const newTo = this.findInterfaceByTemplateId(nodes, to.templateId);
            if (!newTo) {
                return true;
            }
            to = newTo;
        }

        const dc = { from, to, id: "dc", destructed: false, isInDanger: false } as IConnection;

        const copy = connections.concat([dc]);
        copy.filter((conn) => conn.to !== to);
        return containsCycle(nodes, copy);
    }

    private onChange(recalculateOrder: boolean) {
        this.recalculateOrder = this.recalculateOrder || recalculateOrder;
        if (this.calculateOnChange && !this.calculationInProgress) {
            this.calculate();
        }
    }

    private calculateNodeTree() {
        this.orderCalculationData = calculateOrder(
            this.editor.graph.nodes,
            this.editor.graph.connections,
            this.rootNodes,
        );
    }

    private findInterfaceByTemplateId(nodes: ReadonlyArray<AbstractNode>, templateId: string): NodeInterface | null {
        for (const n of nodes) {
            for (const intf of [...Object.values(n.inputs), ...Object.values(n.outputs)]) {
                if (intf.templateId === templateId) {
                    return intf;
                }
            }
        }
        return null;
    }
}

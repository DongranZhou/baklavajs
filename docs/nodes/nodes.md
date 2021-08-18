# Creating Nodes

A graph is comprised of nodes as well as connections between these nodes. A node inside the graph can be seen as the instance of a class.
You have to define the "class" before being able to create the node.

Each node is similar to a function in programming: It receives input data, performs some calculation and returns output data. For input and output so-called [Node Interfaces](./interfaces) are used. The calculation is done inside the `calculate` function. You can find more about it [here](../execution).

There are two approaches for defining node types:

## defineNode()

This is the recommended way to create node types as it is easier to understand what's happening and provides more type safety when using TypeScript.
The `defineNode` function is similar to the `defineComponent` function of Vue (hence the name). It expects a single argument, which is an object defining the node type.

You can find all the properties of the object <a href="/api/">here</a>, but these are the most important ones:

-   `type`: This is the only required property. The node type is used for saving and loading graphs, for example. It can essentially be seen as the name of your class. Therefore, it has to be unique.
-   `title`: (_optional_) The default title of the node. If this property isn't specified, the `type` is used as the default title. (Note that users can rename nodes, so don't rely on the title for identifying nodes).
-   `inputs`: An object specifying the input interfaces of the node. The keys are the "handle" for the node interface, while the values are functions that return a `NodeInterface` instance (or an instance of a subclass of `NodeInterface`).
-   `outputs`: An object specifying the input interfaces of the node. It has the same structure as the `inputs` object.
-   `calculate`: A function that is called whenever the node is executed. You can find more details on the [Graph Execution](../execution) page.

Additionally, you can provide [lifecycle callbacks](./lifecycle).

Let's put it all together into an example. In this case, we want to have a node that receives two numbers, performs an arithmetic operation on them and outputs the result. This means we need three inputs (the two numbers and the arithmetic operation) and one output (the result of the calculation):

```ts
import { defineNode, NodeInterface, NumberInterface, SelectInterface } from "baklavajs";

export default defineNode({
    type: "MathNode",
    inputs: {
        number1: () => new NumberInterface("Number", 1),
        number2: () => new NumberInterface("Number", 10),
        operation: () => new SelectInterface("Operation", "Add", ["Add", "Subtract"]).setPort(false),
    },
    outputs: {
        output: () => new NodeInterface("Output", 0),
    },
    calculate({ number1, number2, operation }) {
        let output: number;
        if (operation === "Add") {
            output = number1 + number2;
        } else if (operation === "Subtract") {
            output = number1 - number2;
        } else {
            throw new Error("Unknown operation: " + operation);
        }
        return { output };
    },
});
```

## Class-based approach

For nodes that have dynamic inputs and outputs, it is also possible to use a class-based approach similar to BaklavaJS V1.
However, be aware that this is not type-safe! If possible, always prefer the approach using `defineNode()`

Although it doesn't really make sense to use it in this case, here is the `MathNode` from the example above
written using the class-based approach:

```js
import { AbstractNode, NodeInterface, NumberInterface, SelectInterface } from "baklavajs";

export default class MathNode extends AbstractNode {
    constructor() {
        super();
        this.type = "MathNode";
        this.title = this.type;
        this.inputs = {};
        this.outputs = {};
        this.addInput("number1", new NumberInterface("Number", 1));
        this.addInput("number2", new NumberInterface("Number", 10));
        this.addInput("operation", new SelectInterface("Operation", "Add", ["Add", "Subtract"]).setPort(false));
        this.addOutput("output", new NodeInterface("Output", 0));
        this.calculate = ({ number1, number2, operation }) => {
            let output;
            if (operation === "Add") {
                output = number1 + number2;
            } else if (operation === "Subtract") {
                output = number1 - number2;
            } else {
                throw new Error("Unknown operation: " + operation);
            }
            return { output };
        };
    }
}
```
const Intrinsics = require("parallel-branch/intrinsics");
const plugin = require("@parallel-branch/babel-plugin");
const { parse, transform } = require("@babel/core");
const generate =
    (({ default: generate }) => (...args) => generate(...args).code)
    (require("@babel/generator"));


const PrinterPrototype = require("@babel/generator/lib/printer").default.prototype;

PrinterPrototype["BranchExpression"] = function (node)
{
    this.word("branch");

    this.space();

    const terminatorState = this.startTerminatorless();

    this.print(node.argument, node);
    this.endTerminatorless(terminatorState);
}

PrinterPrototype["BranchingExpression"] = function (node)
{
    this.word("branching");

    this.space();

    const terminatorState = this.startTerminatorless();

    this.print(node.argument, node);
    this.endTerminatorless(terminatorState);
}

PrinterPrototype["DeriveCallAndBranchExpression"] = function (node, parent)
{
    const { optional, callee, arguments } = node;
    const ds = new Set(node.ds);

    return this.print(
    {
        type: optional ? "OptionalCallExpression" : "CallExpression",
        callee,
        arguments: arguments
        .map((argument, index) =>
            ds.has(index) ?
                { type: "BranchingExpression", argument } :
                argument)
    }, parent);
}
const isCallExpressionToIntrinsic = (node, intrinsic) =>
    node.type === "CallExpression" &&
    node.callee.type === "IntrinsicReference" &&
    node.callee.id === intrinsic.name;
/*
 node.type === "IntrinsicReference";

*/

/*
 isIntrinsicReference(node) && isIntrinsicReference.n



    CALL(callee: BRANCH)
     /
    args
    /
    CALL(callee: [CALL(δ.apply)])
*/

const PrintCallExpression = PrinterPrototype["CallExpression"];

PrinterPrototype["CallExpression"] = function (node, parent, ...rest)
{
    const fallback = () => PrintCallExpression.call(this, node, parent, ...rest);

    if (!isCallExpressionToIntrinsic(node, Intrinsics.Branch) ||
        node.arguments.length !== 1)
        return fallback();
console.log("THIS FAR");
    const argument = node.arguments[0];

    if (argument.type !== "CallExpression" ||
        !isCallExpressionToIntrinsic(argument.callee, Intrinsics.Apply))
        return this.BranchExpression({ argument: node.arguments[0] }, parent, ...rest);
//        return fallback();

    const δapplyCallExpression = argument.callee;
    console.log(δapplyCallExpression.arguments);
    const [receiverExpression, dsExpression] = δapplyCallExpression.arguments;

    const [object, property] = receiverExpression.elements;
    const ds = new Set(dsExpression
        .elements
        .map(literal => literal.value));

    return this.print(
    {
        type: node.optional ? "OptionalCallExpression" : "CallExpression",
        callee: object,
        arguments: argument
            .arguments
            .map((argument, index) =>
                ds.has(index) ?
                    { type: "BranchingExpression", argument } :
                    argument)
    }, parent);
    /*

     ||
        !(argument.callee
    
    
        !isCallExpressionToIntrinsic(arguments[0], "δ.apply"))
        return fallback();
        
        
    const δapplyCallExpression = arguments[0];
    

    return this.print(
    {
        type: node.optional ? "OptionalCallExpression" : "CallExpression",
        callee,
        arguments: arguments
            .map((argument, index) =>
                ds.has(index) ?
                    { type: "BranchingExpression", argument } :
                    argument)
    }, parent);
    PrintCallExpression.apply(this.callee
        )

    return */
}

PrinterPrototype["IntrinsicReference"] = function (node)
{
    if (node.intrinsic === Intrinsics.Branch)
        return this.BranchExpression(node);
console.log(node);
    this.exactSource(node.loc, () => {
        this.word(`%${node.intrinsic.name}%`);
    });
}

const f =   `

parallel function a3(x, y, z)
{
    return x(branching a);
}

function a2(x, y, z)
{
    return  b1 ? a.c(d, d) :
            b1 ? a[c](d, d) :
            b1 ? a["c"](d, d) :
            b1 ? a[x](d, d) :
            a.c.d(d, d);
}

parallel function a(x, y, z)
{
    return  branch b1 ? branch a.c(branching d, branch d) :
            branch b1 ? branch a[c](branching d, branch d) :
            branch b1 ? branch a["c"](branching d, branch d) :
            branch b1 ? branch a[branch x](branching d, branch d) :
            branch a.c.d(branching d, branch d);
}

typeof y;

const y = -f(x);
`;

const result = parse(f, { plugins: [plugin] });

console.log(result.program.body[0].body.body[0].argument);
console.log(generate(result, { compact: false, retainLines: true }));

/*

`function a(x, y, z)
{
    return  b1 ? a.c(d, d) :
            b1 ? a[c](d, d) :
            b1 ? a["c"](d, d) :
            b1 ? a[x](d, d) :
            a.c.d(d, d);
}`

 `parallel function a(x, y, z)
{

//    const { a, b } =  f(branching x);
    const a = branch c;//(branch (branch c()));

    return a;
    
    const { a, b } = x + y;

    return a;
}`
*/

//console.log(eval(transform(`(${f})().definition`, { plugins: [plugin]/*, generatorOpts: { concise:true }*/ }).code));
//console.log(eval(transform(`(${f})().definition.entrypoints.toString`, { plugins: [plugin]/*, generatorOpts: { concise:true }*/ }).code));
//console.log(eval(transform(`(${f})().definition`, { plugins: [plugin]/*, generatorOpts: { concise:true }*/ }).code));
//console.log(transform(f, { plugins: [plugin]/*, generatorOpts: { concise:true }*/ }).code);

// console.log(eval(transform(`
// (async function() { await (${f})() })()`, { plugins: [plugin]/*, generatorOpts: { concise:true }*/ }).code));

/*

const f = `parallel function q(x, y, z)
{
    const { a, b = branch z() } = x + y;

    return a;
}`;

*/
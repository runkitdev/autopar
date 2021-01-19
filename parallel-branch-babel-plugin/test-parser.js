const plugin = require("@parallel-branch/babel-plugin");
const { parse, transform } = require("@babel/core");
const generate =
    (({ default: generate }) => node => generate(node).code)
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

PrinterPrototype["DeriveAndBranchExpression"] = function (node, parent)
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

const f =  `parallel function a(x, y, z)
{
    return branch c(branching d, branch d);
}`;

const result = parse(f, { plugins: [plugin] });

console.log(result.program.body[0].body.body[0].argument);
console.log(generate(result));

/*
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
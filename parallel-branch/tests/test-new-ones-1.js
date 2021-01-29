Error.stackTraceLimit = 1000;
const Intrinsics = require("parallel-branch/intrinsics");
const plugin = require("@parallel-branch/babel-plugin");
const transform = require("@babel/core").transform;
const toSource = require("@parallel-branch/babel-plugin/to-source");
const log_and_val = x => (console.log(x), eval(x));
const run = require("@parallel-branch/task/run");
const take_time = () => Promise.resolve(7);
const throw_it = x => Promise.reject(x);
const delay = timeout => new Promise(resolve => setTimeout(timeout, resolve));

const f =  `parallel function a(x, y, z)
{
//    const { a, b } =  f(branching x);
//    const a = branch (c + y) + branch(c + z);//(branch (branch c()));
    const a = branch c + branch d;

    return a;
}`;

const AST = transform(f, { plugins: [plugin], code: false }).ast;
console.log(AST);
const source = toSource(AST);

console.log(AST);
console.log(source);

/*
 `parallel function a(x, y, z)
{
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
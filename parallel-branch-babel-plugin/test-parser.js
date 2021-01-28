const Intrinsics = require("parallel-branch/intrinsics");
const plugin = require("@parallel-branch/babel-plugin");
const { parse, transform } = require("@babel/core");

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
const toSource = require("@parallel-branch/babel-plugin/to-source");
console.log(result.program.body[0].body.body[0].argument);
console.log(toSource(result, { compact: false, retainLines: true }));

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
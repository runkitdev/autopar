
const plugin = require("@parallel-branch/babel-plugin");
const transform = require("@babel/core").transform;
const log_and_val = x => (console.log(x), eval(x));

log_and_val(transform(`

const u = async id => (await 0, id);

const x = {
    a: parallel function f(a)
    {
        return f(branching d, branching e);
    },
    y: parallel function f(a)
    {
        if (a < 1)
            return 5;

        const x = 10 + a;
        const y = [1,2,3].map(branching u);
        const z = true && branch u(300000);
    
        return x + y[0] + (z ? 2 : 2);
    },
    z: parallel function f()
    {
        const y = x.y;

        return branch u(20) + branch x.y(10) + branch y(10) + branch x["y"](10);
    },
    p: parallel function p()
    {
        return (console.log("at least here"), true) && branch x.y(30);
    }
};

(async function ()
{
    console.log(x.a + "");
    console.log("hi" + await x.p());
})();
`, { plugins: [plugin] }).code);

/*
log_and_val(transform(`

parallel function f()
{
    const x = 10 + 1;

    return x;
};

(async function ()
{
    console.log(await f());
})();
`, { plugins: [plugin] }).code);

eval(transform(`
const Task = require("@cause/task");
const id = Task.fromAsync(x => new Promise(resolve => setTimeout(() => resolve(x), 1000)));

(async function ()
{console.log(f());
    console.log(await f());
})();

parallel function f()
{
    const start = Date.now();
    const result = branch[id](10) + branch[id](20);
    const end = result + console.log("TOOK: " + (Date.now() - start));

    return (end, result);
}
`, { plugins: [plugin] }).code);


console.log(transform(`

if (true ) {
parallel function f()
{
    const r = branch[a.b]();

    if (branch[f]())
        return 5;

    return branch[c]() + f(branch[a], branch[b], branch[c](d));
}

parallel function testConcurrent()
{
    const result1 = branch[a]() + branch[b]();
    const result2 = f(result1) + branch[c](result1);
    const result3 = [1,2,3].map(branch[d]).reduce(f, result2);
    const result4 = branch[c](branch[a]());
    
    if (branch[d](result4))
        return branch[p]();

    if (branch[d](result4) + 1)
        throw branch[p]();

    if (branch[e](result4) + 2)
    {
        const result7 = branch[u]();

        return result7 + branch[y]();
    }

    return result3;
}
}
`, { plugins: [plugin] }).code);

/*

const generate = node => require("@babel/generator").default(node).code
const parse = require("@algebraic/ast/parse").expression;
const autobranch = require("parallel-branch/differentiate");

//const node = require("./map-conc")(parse( WRAP+""));
const node = autobranch(parse((() => parallel(() =>
{
    if (branch[f]())
        return 5;

    return branch[c]() + f(branch[a], branch[b], branch[c](d));
}))+ ""));

parallel function (x)
{
    return branch[f]() + branch[g]();
}


/*
    const a = branch[b]();
    const c = branch[d]() + 7 + branch[e]();
    
    if (c)
        return c + 1;

    const o = f(branch[a], 10);
    const x = c.map(branch[u]);
    const z = y + m.reduce(branch[u], 20);
    const y = 9;
    const r = 1 + branch[d](branch[e]()) - c + y;

    return branch[a]();*/

/*
const d = () => "10"
const a = () => (c,d);
const c = () => branch[a()]() + 1;

return c();
*/

//console.log(node);
//console.log(generate(node));


/*
const Scope = require("./scope");
const mapScope = require("./map-scope");
const disambiguateIdentifiers = require("./disambiguate-identifiers");
const mapConcurrent = require("./map-concurrent");

// Another example of derivatives? I can only opreatee of disambiguated...
const disambiguated = disambiguateIdentifiers.function(testConcurrent2);
const scoped = mapScope(disambiguated);
const concurrent = mapConcurrent(scoped);

mapConcurrent.getConvertedType(concurrent).dependencies.map(dependency => console.log(dependency.keyPath + ""));
console.log(Scope.for(concurrent));
console.log(require("@babel/generator").default(concurrent).code);
*/

// Scope boundary

/*
function testConcurrent()
{
    const result1 = branch[a]() + branch[b]();
    const result2 = f(result1) + branch[c](result1);
    const result3 = [1,2,3].map(branch[d]).reduce(f, result2);
    const result4 = branch[c](branch[a]());
    
    if (branch[d](result4))
        return branch[p]();

    if (branch[d](result4) + 1)
        throw branch[p]();

    if (branch[e](result4) + 2)
    {
        const result7 = branch[u]();

        return result7 + branch[y]();
    }

    return result3;
}

function WRAP(){
return parallel(
function testConcurrent2()
{
    const   result1 = branch[a]() + branch[b](),
            result2 = branch[f](result1);
    const result3 = a_function();;;;
    const result4 = result3 || branch[d]();
    const result5 = result4 ? branch[e]() : g();
    const y = 5 + m;
    const z = 1 - y;
    const a = () => b;
    const b = () => a;

;
;
;
;
/*
    if (branch[d](result4))
        return branch[p]();

    if (branch[d](result4) + 1)
        throw branch[p]();

    if (branch[e](result4) + 2)
    {
        const result7 = branch[u]();

        return result7 + branch[y]();
    }
*//*
    return if_ (result5, () => stuff, () => other_stuff);;
    
    function a_function()
    {
        return result2;
    }
}) };


function bFunctionName(bFunctionParameter)
{
    const b1 = f1;
    const [b2, ...b3] = [f2, ...f3];

    {
        const [hidden1, ...hidden2] = f4;
    }
    
    {
        const [hidden3, ...hidden4] = f5;

        {
            const [hidden5, ...hidden6] = f6;
        }
    }

    if (f7 > b2)
    {
        const [hidden7, ...hidden8] = f8;

        return hidden7 + hidden8 + f9 + f8;
    }
    
    const { b4, hidden9: b5, hidden10:
        { b6, hidden11: [b7, ...b8], ...b9 } } = f10;
    
    const [b10 = f11] = f12;
}*/
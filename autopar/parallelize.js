const { fNamed } = require("@algebraic/type/declaration");
const fail = require("@algebraic/type/fail");
const CacheSymbol = Symbol("autopar:parallelize-cache");
const toCacheKey = bs => JSON.stringify(bs);
const Task = require("@cause/task");

const parallelize = (function ()
{
    const compute = (f, bs) => fail("Not implemented");

    return function parallelize(f, bs)
    {
        const cache =
            f[CacheSymbol] ||
            (f[CacheSymbol] = Object.create(null));
        const entry = []
        const key = toCacheKey(bs);

        return cache[key] || (cache[key] = compute(f, bs));
    }    
})();

module.exports = parallelize;

module.exports.parallelize = parallelize;

module.exports.apply = Task.taskReturning((object, property, bs, args) =>
{
    try {
    const r = parallelize(object[property], bs).apply(object, args);
    //console.log("APPLY RETURNED " + r + (Error().stack));
    return r;
} catch (e) { console.log(e) }
})

module.exports.precomputed = (function ()
{
    const fNameRegExp = /^\(([^\)]*)\)/;
    const bs = f => fNameRegExp
        .exec(f + "")[1]
        .split(/\s*,\s*/)
        .flatMap((name, index) =>
            name.startsWith("branching") ? [index] : []);
    const { assign, fromEntries } = Object;

    return ([name]) =>
        (f, ...precached) => assign(
            fNamed(name, f), 
            fromEntries([[CacheSymbol,
                fromEntries(precached.map(bf =>
                    toCacheEntry(f, bs(bf), bf)))]]));
})();

function toCacheEntry(f, bs, bf)
{
    const name = `[∂branching/${bs.map(b => `∂${b}`).join("")}](${f.name})`;

    return [toCacheKey(bs), Task.taskReturning(fNamed(name, function (...args)
    {console.log(f+"");
        return f.apply(this, args);
    }))];
}

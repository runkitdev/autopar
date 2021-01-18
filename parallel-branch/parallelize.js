const { isArray } = Array;
const flatMap = require("@climb/flat-map");

const { fNamed } = require("@algebraic/type/declaration");
const fail = require("@algebraic/type/fail");
const CacheSymbol = Symbol("parallel-branch:parallelize-cache");
const toCacheKey = bs => JSON.stringify(bs);


const parallelize = (function ()
{
    return function parallelize(δ, f, bs)
    {
        const cache =
            f[CacheSymbol] ||
            (f[CacheSymbol] = Object.create(null));
        const entry = []
        const key = toCacheKey(bs);

        return cache[key] || (cache[key] = require("./differentiate")(δ, f, bs));
    }    
})();

module.exports = parallelize;

module.exports.parallelize = parallelize;

function precomputed(f, bs, bf)
{
    const cache =
        f[CacheSymbol] ||
        (f[CacheSymbol] = Object.create(null));
    const entry = []
    const key = toCacheKey(bs);

    return cache[key] || (cache[key] = wrapped(f.name, bs, bf));
}

module.exports.precomputed = precomputed;

function wrapped(name, bs, bf)
{
    // UGH: WITHOUT THIS, bf.apply(this, args) gets passed global.
    // This is because when you call bf() (instead of x.bf()), there is
    // no this.
    "use strict";

    const bname = `[∂branching/${bs.map(b => `∂${b}`).join("")}](${name})`;

    return fNamed(bname, function (...args)
    {
        return bf.apply(this, args);
    });
}

module.exports.operator = (function ()
{
    const fNameRegExp = /^\(([^\)]*)\)/;
    const findBs = f => flatMap(
        (name, index) => name.startsWith("branching") ? [index] : [],
        fNameRegExp
            .exec(f + "")[1]
            .split(/\s*,\s*/));

    return ([name]) => function (f, ...bfs)
    {
        const named = fNamed(name, f);

        for (bf of bfs)
            (bs => precomputed(named, bs, bf))(findBs(bf));

        return named;
    }
})();

const { isArray } = Array;
const { Δ, type } = require("@algebraic/type");
const keys = node => type.of(node).traversable;

const mapAccum = (f, accum) =>
{
    const trivial = (accum, node) =>
        !node ? [accum, node] :
        isArray(node) ? mapAccumArray(custom, accum, node) :
        keys(node).reduce(([accum, node], key) =>
            ((child, [uAccum, uChild] = custom(accum, child)) =>
                [uAccum, child === uChild ?
                    node : Δ(node, { [key]: uChild })])
            (node[key]),
            [accum, node]);
    const custom = (accum, node) =>
        !node ? [accum, node] :
        isArray(node) ? mapAccumArray(custom, accum, node) :
        f(accum, node, trivial);

    return (accum, ...rest) =>
        rest.length <= 0 ?
            node => custom(accum, node) :
            custom(accum, rest[0]);
}

const map = f => mapAccum(([_, node]) => [_, f(node)], 0);

module.exports = map;

map.accum = mapAccum;

function mapAccumArray(f, accum, array)
{console.log("OK!")
    const count = array.length;
    let mapped,
        returnedArray = array;
 
    for (let index = 0; index < count; ++index)
    {
        const original = returnedArray[index];
        [accum, mapped] = f(accum, original);

        if (mapped === original)
            continue;

        if (array === returnedArray)
            returnedArray = array.slice(0);

        returnedArray[index] = mapped;
    }

    return [accum, returnedArray];
}


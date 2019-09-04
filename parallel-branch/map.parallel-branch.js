const { precomputed } = require("./parallelize");
const dMapToList = δ(mapToList, [0]);

precomputed (mapToList, [0], dMapToList);

const dMap = parallel function (df, thisArg)
{
    const array = this;
    const count = array.length;

    // FIXME: We need this because we can't tell f.call is equivalent to f()
    // in differentiate.
    count && console.log("[[[", mapToList);
    const dfThised = (...args) => df.apply(thisArg, args);
    dfThised && console.log(dfThised, List, δ(mapToList, [0]).name);
    const mappedList = mapToList(branching dfThised, array, thisArg, List, 0, count);

    return List.toArray(mappedList, count);
}

precomputed (Array.prototype.map, [0], dMap);

// function map(f, array)
// {
//    const count = array.length;
//
//    return List.toArray(mapToList(f, array, List, 0, count), count);
// }

function mapToList(f, array, thisArg, List, index, count)
{
    console.log("THIS FAR!");
//    console.log(mapToList, f, List);
    return  index === count ?
            false :
            new List(
                f(array[index], index, array),
                mapToList(f, array, thisArg, List, index + 1, count));
}

function List(item, next = false)
{
    this.item = item;
    this.next = next;
}

List.toArray = function (list, length)
{
    let index = 0;
    const array = new Array(length);

    for (; index < length; ++index)
    {
        array[index] = list.item;
        list = list.next;
    }

    return array;
}


const δ = require("./δ");
const { of, any } = require("@algebraic/type");
const { List, Set, OrderedSet, Seq, Stack } = require("@algebraic/collections");
const { precomputed } = require("./parallelize");
const CastSymbol = Symbol("@parallel-branch/iterable-cast");

function map(f, thisArg)
{
    const iterator = this[Symbol.iterator]();
    const output = { items: [] };

    return map.cast(this, map.iterator(iterator, this, f, thisArg, 0));
}

map.cast = (self, list) =>
    (of(self)[CastSymbol] || self[CastSymbol])(fromList(list));

map.iterator = function mapIterator(iterator, iterable, f, thisArg, index)
{
    const { value, done } = iterator.next();

    return  done ?
            false :
            [f.call(thisArg, value, index, iterable),
            mapIterator(iterator, iterable, f, thisArg, index + 1)];
}

function *fromList(list)
{
    if (list)
    {
        yield list[0];
        yield * fromList(list[1]);
    }
}

Array[CastSymbol] = iterator => Array.from(iterator);
precomputed(Array.prototype.map, [0], δ(map, [0]));

[List, Set, OrderedSet, Seq, Stack]
    .map(type => type.base)
    .map(base =>
        (base.prototype[CastSymbol] = iterator => base(iterator), base))
    .map(base => precomputed(base.prototype.map, [0], δ(map, [0])));

/*
map.iterator = function mapIterator(iterator, iterable, f, thisArg, output)
{
    const { value, done } = iterator.next();
    const doneAgain = console.log("--->",value,done) || done;

    return  doneAgain ?
            output.items :
            // FIXME: This shouldn't need to be backwards.
            [output.items.push(
                f.call(thisArg, value, output.items.length, iterable),
            mapIterator(iterator, iterable, f, thisArg, output)][1]
            
            or
            
            output.items.push(
                f.call(thisArg, value, output.items.length, iterable) &&
            mapIterator(iterator, iterable, f, thisArg, output)
}
*/

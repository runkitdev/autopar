
function map(f, array)
{
    const count = array.length;

    return List.toArray(mapToList(List, f, array, 0, count), count);
}

function mapToList(List, f, array, index, count)
{
    return  index === count ?
            false :
            new List(
                f(array[index]),
                mapToList(List, f, array, index + 1, count));
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

console.log(map(x => x + 1, [1,2,3,4,5]));
const partition = require("@climb/partition");
const swapped = new Set();
const factories = Object.create(null);
const classes = Object.create(null);
const getClass = object => Object.getPrototypeOf(object).constructor;
const { hasOwnProperty } = Object;


module.exports = function addParserPlugin(parse, name, toClass)
{
    factories[name] = toClass;

    if (swapped.has(parse))
        return;

    try
    {
        Object.defineProperty(Object.prototype, "options",
        {
            configurable: true,
            set(options)
            {
                const Parser = getClass(this);
                const Superclass = getClass(Parser.prototype);

                Object.setPrototypeOf(Parser,
                    class WireTap extends Superclass
                    {
                        constructor(...args)
                        {
                            super(...args);

                            return fixParserClass(
                                this,
                                Parser.constructor,
                                args);
                        }
                    });
            }
        });

        parse("");
    }
    catch (e) { }

    delete Object.prototype.options;

    swapped.add(parse);

    parse("5+5");
}

function fixParserClass(thisArg, constructor, args)
{
    const [options] = args;
    const [standard, custom] = partition(name =>
        !hasOwnProperty.call(factories, name),
        options.plugins);

    if (custom.length <= 0)
        return thisArg;

    const key = [...standard, ...custom].join("/");
    const subclass =
        classes[key] ||
        (classes[key] = custom.reduce(
            (superclass, key) => factories[key](superclass),
            getClass(thisArg)));

    Object.setPrototypeOf(thisArg, subclass.prototype);

    return thisArg;
}


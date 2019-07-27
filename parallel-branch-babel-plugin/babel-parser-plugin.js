const { fNamed } = require("@algebraic/type/declaration");
const partition = require("@climb/partition");
const swapped = new Set();
const factories = Object.create(null);
const classes = Object.create(null);
const getClass = object => Object.getPrototypeOf(object).constructor;
const { hasOwnProperty } = Object;


module.exports = function parser([name])
{
    return function (factory)
    {
        factories[name] = factory;

        return fNamed(name, babel => (register(babel), name));
    }
}

function register(babel)
{
    const { parse } = babel;

    // We only want to do this regisration once per *babel instance*. This one
    // registration will work for all custom plugins.
    if (swapped.has(parse))
        return;

    // Add this parse instance so we only do this once.
    swapped.add(parse);

    // Get the base Parser class associated with this instance of parse.
    const Parser = getParserClass(parse);

    // Grab the superclass so that we can create a new "writetap" class
    // that gets inserted in-between the two.
    const superclass = getClass(Parser.prototype);

    // Technically this isn't a "full" class because we only insert it into
    // Parser's __proto__ chain, not it's prototype chain. This is partially
    // by necessity: we can't modify Parser.prototype unfortunately. But as
    // it turns out we don't need to be in the prototype chain anyways, as we
    // only care about the constructor being called.
    Object.setPrototypeOf(Parser, class WireTappedParser extends superclass
    {
        constructor(...args)
        {
            super(...args);

            // Babel ignores syntax plugins that it doesn't recognize, but keeps
            // them in the options plugins property. We check whether any of them
            // are onese *we* recognize.
            const [options] = args;
            const [standard, custom] = partition(name =>
                !hasOwnProperty.call(factories, name),
                options.plugins);
 
            // If not, there's nothing special to do and we allow things to continue
            // normally.
            if (custom.length <= 0)
                return this;

            // If there is though, we construct a new key the same way Babel does,
            // but we re-arrange the plugins to ensure ours come last. This is to
            // avoid the potential work of having to create strange in-between
            // classes. This has less of a chance of breaking Babel too, as they can
            // continue to only expect their own classes to be in their chain.
            const key = [...standard, ...custom].join("/");

            // Just like Babel, we construct a bespoke subclass based on the plugin
            // ordering, starting with whatever we currently are as the "base"
            // class. We cache this as well to avoid doing every single time.
            const subclass = classes[key] || (classes[key] = custom.reduce(
                (superclass, key) => factories[key](babel, superclass),
                getClass(this)));

            // This is a little tricky, we'll actually end up in this code twice!
            // The first time will be through the `new BaseClass()` that Babel
            // originally calls. In this case we *won't* be an instance of our new
            // subclass, so we need to swap this enttire object with a new one.
            // However, *that* call will also end up here since we're a superclass
            // of subclass. In that case, we have to just call super to keep things
            // moving along correctly.
            return  this instanceof subclass ?
                    this :
                    new subclass(...args);
        }
    });
}

// Babel doesn't expose the Parser class, so we need a way of grabbing it.
function getParserClass(parse)
{
    let Parser = null;

    // We know that the Parser constructor sets .options on `this`, so we create
    // an `options` setter on the Object prototype in order to hook into this
    // call. We then grab `this`'s class and store it in order to return it.
    Object.defineProperty(Object.prototype, "options",
    {
        // This can't be an arrow function since then we wouldn't have access to
        // `this`!
        set: function (options) { Parser = getClass(this) },
        configurable: true
    });

    // Now kick off a dummy parse just to get that code called. Since we've
    // broken the options setter in the process, this will throw.
    try { parse(""); } catch (e) { }

    // Remove this hack.
    delete Object.prototype.options;

    return Parser;
}

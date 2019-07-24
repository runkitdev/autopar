const parser = require("@babel/parser");

module.exports = function addParserPlugin(parser, name, toClass)
{
    swizzleOnce(Array.prototype, "filter", function (...args)
    {
        this.push(name);
        const filtered = this.filter(...args);

        swizzleOnce(Object.prototype, name, function (superclass)
        {
            this[name] = toClass;

            return this[name](superclass);
        });

        return filtered;
    });

    parser.parse("", { plugins:["estree", name] });
}

function swizzleOnce(object, name, f)
{
    const existing = Object.getOwnPropertyDescriptor(object, name);

    Object.defineProperty(object, name,
    {
        configurable: true,
        get()
        {
            if (existing)
                Object.defineProperty(object, name, existing);
            else
                delete object[name];
            return f;
        }
    });
}

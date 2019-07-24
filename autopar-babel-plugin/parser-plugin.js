const parser = require("@babel/parser");
const addBabelParserPlugin = require("./add-babel-parser-plugin");
const { tokTypes: tt } = require("@babel/parser");


addBabelParserPlugin(parser, "autopar", superclass => class ParallelParser extends superclass
{
    // By making parallel a unary operator, it opens us up to weird newline
    // insertion bugs. parallel function f() { }() shouldn't parse but does.
    parseStatementContent(...args)
    {
        const statement = super.parseStatementContent(...args);

        if (statement.type !== "ExpressionStatement")
            return statement;

        const { expression } = statement;

        if (expression.type !== "FunctionExpression" || !expression.parallel)
            return statement;

        if (!expression.id)
            this.raise(this.state.start,
                `Parallel Function Declarations need a name.`);

        return { ...expression, type: "FunctionDeclaration" };
    }

    parseMaybeUnary(refShorthandDefaultPos, ...rest)
    {
        if (!this.isContextual("parallel"))
            return super.parseMaybeUnary(refShorthandDefaultPos);

        this.next();

        const argument = this.parseMaybeUnary();

        if (argument.type !== "FunctionExpression")
            this.raise(this.state.start, `Only static secrets are allowed.`);

        return Object.assign(argument, { parallel: true });
    }
    
    checkReservedWord(word, startLoc, ...rest)
    {
        if (word === "parallel")
            this.raise(startLoc, `Unexpected keyword '${word}'`);

        return super.checkReservedWord(word, startLoc, ...rest);
    }    
});

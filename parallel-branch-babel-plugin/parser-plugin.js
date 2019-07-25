const parser = require("@babel/parser");
const addBabelParserPlugin = require("./add-babel-parser-plugin");
const { tokTypes: tt } = require("@babel/parser");
const t = require("@babel/types");


addBabelParserPlugin(parser, "parallel-branch", superclass => class ParallelParser extends superclass
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

    parseBranchExpression(...args)
    {
        this.next();

        const argument = this.parseMaybeUnary(...args);

        if (argument.type !== "CallExpression")
            this.raise(this.state.start,
                `Can only branch on a function call.`);

        return t.CallExpression(t.Identifier("branch"), [argument]);
    }

    parseBranchingExpression(...args)
    {
        this.next();

        const argument = this.parseMaybeUnary(...args);

        return t.CallExpression(t.Identifier("branching"), [argument]);
    }

    parseMaybeUnary(...args)
    {
        if (this.isContextual("branch"))
            return this.parseBranchExpression(...args);

        if (this.isContextual("branching"))
            return this.parseBranchingExpression(...args);

        if (!this.isContextual("parallel"))
            return super.parseMaybeUnary(...args);

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

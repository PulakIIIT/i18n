import { CallExpression, Expression, transformSync } from "@swc/core";
import { Visitor } from "@swc/core/Visitor.js";

class ConsoleStripper extends Visitor {
  visitCallExpression(expression: CallExpression): Expression {
    if (expression.callee.type !== "MemberExpression") {
      return expression;
    }

    if (
      expression.callee.object.type === "Identifier" &&
      expression.callee.object.value === "console"
    ) {
      if (expression.callee.property.type === "Identifier") {
        return {
          type: "UnaryExpression",
          span: expression.span,
          operator: "void",
          argument: {
            type: "NumericLiteral",
            span: expression.span,
            value: 0,
          },
        };
      }
    }

    return expression;
  }
}

const out = transformSync(
  `
if (foo) {
    console.log("Foo")
} else {
    console.log("Bar")
}`,
  {
    plugin: (m) => new ConsoleStripper().visitProgram(m),
  }
);

out.code ===
  `if (foo) {
    void 0;
} else {
    void 0;
}`;
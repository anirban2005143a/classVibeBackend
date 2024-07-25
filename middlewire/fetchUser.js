const jwt = require("jsonwebtoken");
require('dotenv').config();
const JWTserect = process.env.JWT_MESSAGE;

const fetchuser = (req, res, next) => {
  const jwtToken = req.header("authToken")
  if (!jwtToken) {
    return res.json({ message: "You do not have authentication token",authError: true, error: true, status: 401 });
  }
  try {
    const token = jwt.verify(jwtToken, JWTserect);
    req.id = token.id;
    next();
  } catch {
    return res.json({ message: "LOG-OUT! please login for further aproach",authError: true, error: true, status: 401 });
  }
};

module.exports = fetchuser;

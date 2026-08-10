require('dotenv').config();
const http = require("http");
const { routes, baseUrl } = require("./src/routes");
const { connectDB } = require("./src/config/db");
const { connectRedis } = require("./src/config/redis");

connectDB();
connectRedis();

const server = http.createServer((req, res) => {
  const route = routes.find(
    (r) => r.url === req.url.replace(baseUrl, "") && r.method === req.method,
  );
  if (route) {
    if (route.middleware) {
      const middlewareArray = Array.isArray(route.middleware) ? route.middleware : [route.middleware];
      let index = 0;
      
      const runMiddleware = () => {
        if (index < middlewareArray.length) {
          middlewareArray[index](req, res, () => {
            index++;
            runMiddleware();
          });
        } else {
          route.handler(req, res);
        }
      };
      
      runMiddleware();
    } else {
      route.handler(req, res);
    }
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(8080, () => {
  console.log("Server is running on port 8080");
});

import { createServer, request as httpRequest } from "node:http";

// Drop one response only after its upstream transaction has fully completed.
export async function lostResponseProxy(t, upstream, path) {
  let dropped = 0;
  const server = createServer((request, response) => {
    const forwarded = httpRequest(
      new URL(request.url, upstream),
      {
        method: request.method,
        headers: request.headers,
      },
      (result) => {
        if (request.url === path && dropped === 0) {
          dropped++;
          result.resume();
          result.once("end", () => response.destroy());
        } else {
          response.writeHead(result.statusCode, result.headers);
          result.pipe(response);
        }
      },
    );
    forwarded.once("error", () => response.destroy());
    request.pipe(forwarded);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { url: `http://127.0.0.1:${server.address().port}`, dropped: () => dropped };
}

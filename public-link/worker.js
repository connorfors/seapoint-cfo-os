// Forwards headroom.cb-63a.workers.dev to the Cloudflare quick tunnel on the presenter's Mac.
export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, env.TUNNEL_ORIGIN);
    return fetch(new Request(target, request));
  },
};

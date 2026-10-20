self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};

  try {
    const parsed = event.data ? event.data.json() : {};
    data = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    data = { body: event.data?.text() || "You have a new VETRA update." };
  }

  const audience = data.audience === "clinic" ? "clinic" : "owner";
  const options = {
    body: data.body || "You have a new VETRA update.",
    icon: "/vetra-client-icons-20261012-androidfix/icon-192.png",
    badge: "/vetra-client-icons-20261012-androidfix/icon-192.png",
    tag: data.tag || `vetra-${audience}`,
    renotify: Boolean(data.renotify),
    data: {
      url: data.url || (audience === "clinic" ? "/dashboard" : "/client-interface"),
      audience,
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "VETRA", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const requestedUrl = event.notification.data?.url || "/client-interface";
  const targetUrl = new URL(requestedUrl, self.location.origin);
  if (targetUrl.origin !== self.location.origin) {
    targetUrl.href = new URL("/client-interface", self.location.origin).href;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && new URL(client.url).origin === self.location.origin) {
          if ("navigate" in client) {
            return client.navigate(targetUrl.href).then((navigatedClient) =>
              (navigatedClient || client).focus()
            );
          }
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl.href);
      }
    })
  );
});

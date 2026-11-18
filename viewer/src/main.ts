import { installBridge } from "./bridge";
import { browserLoad } from "./browser";
import { createCampusScene } from "./campus";
import { createRouteScene } from "./route";

const container = document.querySelector<HTMLElement>("#viewer");
if (!container) throw new Error("Missing viewer container");

let campus: ReturnType<typeof createCampusScene> | undefined;
let route: ReturnType<typeof createRouteScene> | undefined;

const send = installBridge(window, (message) => {
  switch (message.type) {
    case "campus:load":
      route?.dispose();
      route = undefined;
      campus ??= createCampusScene(container, (eventId) => send({ type: "campus:flagTapped", eventId }));
      campus.load(message);
      break;
    case "route:load":
      campus?.dispose();
      campus = undefined;
      route ??= createRouteScene(container);
      route.load(message);
      break;
    case "campus:select":
      campus?.handle(message);
      break;
    case "route:goto":
    case "route:play":
      route?.handle(message);
      break;
  }
}, (message) => {
  console.log(message);
  if (message.type === "campus:flagTapped") {
    window.ksugo?.receive({ type: "campus:select", eventId: message.eventId });
  }
});

if (!window.ReactNativeWebView) {
  const now = new Date();
  const initial = browserLoad(window.location.search, now) ?? browserLoad("?scene=campus", now);
  if (initial) {
    const isRoute = initial.type === "route:load";
    const scene = isRoute ? "route" : "campus";
    document.body.classList.add("desktop-preview");
    document.body.dataset.scene = scene;
    document.querySelector(`nav [data-scene="${scene}"]`)?.setAttribute("aria-current", "page");
    document.querySelector("#scene-title")!.textContent = isRoute ? "Indoor route" : "Campus map";
    document.querySelector("#scene-description")!.textContent = isRoute
      ? "Preview the 3D viewer that will guide students from the entrance to the right room."
      : "Preview the 3D viewer that will help students find events around campus.";
    document.querySelector(".scene-footer")?.before(container);
    window.ksugo?.receive(initial);
  }
}

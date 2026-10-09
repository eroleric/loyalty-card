import { retailers } from "./retailers.js";

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createRetailerCard(retailer, index) {
  const item = element("li");
  const card = element("article", "retailer-card");
  const headingId = `retailer-${index}-name`;
  card.setAttribute("aria-labelledby", headingId);
  card.style.setProperty("--retailer-color", retailer.color);
  card.style.setProperty("--retailer-tint", retailer.tint);

  const cover = element("div", "retailer-cover");
  cover.setAttribute("aria-hidden", "true");
  cover.append(
    element("span", "cover-ring"),
    element("span", "cover-ring cover-ring-small"),
    element("span", "retailer-monogram", retailer.initials),
    element("span", "cover-name", retailer.name),
  );

  const details = element("div", "retailer-details");
  const nameRow = element("div", "retailer-name-row");
  const name = element("h3", null, retailer.name);
  name.id = headingId;
  nameRow.append(name, element("span", "retailer-tag", retailer.category));

  const footer = element("div", "retailer-footer");
  // Static decorative icon; retailer text always uses textContent.
  footer.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" fill="none"><rect x="3" y="5" width="14" height="11" rx="2.5"/><path d="M3 8.5h14M6 12h3"/></svg>';
  footer.append(element("span", null, "Loyalty program"));
  details.append(nameRow, element("p", "retailer-program", retailer.program), footer);
  card.append(cover, details);
  item.append(card);
  return item;
}

export function renderRetailers(list) {
  const grid = document.getElementById("retailer-grid");
  const cards = document.createDocumentFragment();
  list.forEach((retailer, index) => cards.append(createRetailerCard(retailer, index)));
  grid.replaceChildren(cards);
  document.getElementById("retailer-count").textContent = String(list.length);
  document.getElementById("retailer-summary").textContent =
    `${list.length} ${list.length === 1 ? "retailer" : "retailers"}`;
}

renderRetailers(retailers);

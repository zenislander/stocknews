const pdfInput = document.querySelector("#pdfInput");
const quoteList = document.querySelector("#quoteList");
const quoteCount = document.querySelector("#quoteCount");
const quoteName = document.querySelector("#quoteName");
const airlineName = document.querySelector("#airlineName");
const quotePrice = document.querySelector("#quotePrice");
const saveDetails = document.querySelector("#saveDetails");
const clearQuotes = document.querySelector("#clearQuotes");
const activeTitle = document.querySelector("#activeTitle");
const activeMeta = document.querySelector("#activeMeta");
const selectQuote = document.querySelector("#selectQuote");
const pdfFrame = document.querySelector("#pdfFrame");
const selectionBanner = document.querySelector("#selectionBanner");
const chosenQuoteName = document.querySelector("#chosenQuoteName");

let quotes = [];
let activeQuoteId = null;
let selectedQuoteId = localStorage.getItem("selectedFlightQuoteId");

const storedDetails = JSON.parse(localStorage.getItem("flightQuoteDetails") || "{}");

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getActiveQuote() {
  return quotes.find((quote) => quote.id === activeQuoteId);
}

function getDetails(quote) {
  return storedDetails[quote.id] || {
    title: quote.file.name.replace(/\.pdf$/i, ""),
    airline: "",
    price: "",
  };
}

function saveStoredDetails() {
  localStorage.setItem("flightQuoteDetails", JSON.stringify(storedDetails));
}

function renderList() {
  quoteCount.textContent = `${quotes.length} PDF${quotes.length === 1 ? "" : "s"}`;
  quoteList.innerHTML = "";

  if (!quotes.length) {
    quoteList.innerHTML = '<p class="empty-list">No quote PDFs added yet.</p>';
    return;
  }

  quotes.forEach((quote) => {
    const details = getDetails(quote);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quote-card";
    button.classList.toggle("active", quote.id === activeQuoteId);
    button.classList.toggle("selected", quote.id === selectedQuoteId);
    button.innerHTML = `
      <strong>${escapeHtml(details.title)}</strong>
      <span>${escapeHtml([details.airline, details.price].filter(Boolean).join(" | ") || "No quote details saved")}</span>
      <span class="file-name">${escapeHtml(quote.file.name)}</span>
    `;
    button.addEventListener("click", () => setActiveQuote(quote.id));
    quoteList.appendChild(button);
  });
}

function setActiveQuote(id) {
  activeQuoteId = id;
  const quote = getActiveQuote();
  const details = getDetails(quote);

  activeTitle.textContent = details.title;
  activeMeta.textContent = [details.airline, details.price, quote.file.name].filter(Boolean).join(" | ");
  quoteName.value = details.title;
  airlineName.value = details.airline;
  quotePrice.value = details.price;
  selectQuote.disabled = false;

  pdfFrame.innerHTML = "";
  const object = document.createElement("object");
  object.type = "application/pdf";
  object.data = quote.url;

  const fallback = document.createElement("iframe");
  fallback.src = quote.url;
  fallback.title = details.title;
  object.appendChild(fallback);
  pdfFrame.appendChild(object);

  renderSelection();
  renderList();
}

function renderSelection() {
  const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteId);
  if (!selectedQuote) {
    selectionBanner.hidden = true;
    chosenQuoteName.textContent = "";
    return;
  }

  selectionBanner.hidden = false;
  chosenQuoteName.textContent = getDetails(selectedQuote).title;
}

function saveActiveDetails() {
  const quote = getActiveQuote();
  if (!quote) return;

  storedDetails[quote.id] = {
    title: quoteName.value.trim() || quote.file.name.replace(/\.pdf$/i, ""),
    airline: airlineName.value.trim(),
    price: quotePrice.value.trim(),
  };

  saveStoredDetails();
  setActiveQuote(quote.id);
}

function selectActiveQuote() {
  const quote = getActiveQuote();
  if (!quote) return;

  saveActiveDetails();
  selectedQuoteId = quote.id;
  localStorage.setItem("selectedFlightQuoteId", selectedQuoteId);
  renderSelection();
  renderList();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[character];
  });
}

pdfInput.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []).filter((file) => file.type === "application/pdf");
  const newQuotes = files.map((file) => ({
    id: makeId(),
    file,
    url: URL.createObjectURL(file),
  }));

  quotes = [...quotes, ...newQuotes];

  if (!activeQuoteId && newQuotes.length) {
    setActiveQuote(newQuotes[0].id);
  } else {
    renderList();
  }

  event.target.value = "";
});

saveDetails.addEventListener("click", saveActiveDetails);
selectQuote.addEventListener("click", selectActiveQuote);

clearQuotes.addEventListener("click", () => {
  quotes.forEach((quote) => URL.revokeObjectURL(quote.url));
  quotes = [];
  activeQuoteId = null;
  selectedQuoteId = null;
  localStorage.removeItem("selectedFlightQuoteId");

  activeTitle.textContent = "No quote loaded";
  activeMeta.textContent = "Upload a PDF to begin reviewing flight options.";
  quoteName.value = "";
  airlineName.value = "";
  quotePrice.value = "";
  selectQuote.disabled = true;
  pdfFrame.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">PDF</div>
      <h3>Flight quote reader</h3>
      <p>Add one or more quote PDFs, open each one here, then select the best option for the traveler.</p>
    </div>
  `;

  renderSelection();
  renderList();
});

renderSelection();
renderList();

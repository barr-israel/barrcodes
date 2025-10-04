function set_theme(color_scheme) { // toggle between dark and light theme(default dark)
  document.body.style.setProperty("color-scheme", color_scheme)
  localStorage.setItem('color-scheme', color_scheme)
}
function copy_code_block(e) {
  navigator.clipboard.writeText(e.target.parentNode.parentNode.nextElementSibling.textContent)
  e.target.innerHTML = "Copied";
  setTimeout(() => { e.target.innerHTML = "Copy" }, 500);
}

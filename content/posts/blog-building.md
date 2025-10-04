---
publishDate: 2024-11-18
title: Building a Responsive Blog With 56 Lines Of JavaScript
author: Barr
keywords: [Blog, HTML, CSS, JavaScript]
description: My “Hello World” post about how I made a blog with just a markdown parser and no client-side dependencies.
summary: |
  For a long time I wanted to write more code, but didn't have a good reason to.  
  Now I have a solution: dump it all on a blog, maybe someone can learn something from it.  
  I'm not a big fan of front-end design, JavaScript, and bloat in general, so I'm somewhat allergic to frameworks.  
  It can't be that hard to write a basic blog without one, right?
github: https://github.com/barr-israel/barrcodes/tree/pandoc
---
Note: Since writing this post, I have switched to using [Hugo](https://gohugo.io/), the original website built in this post is kept(with a few fixes to work with GitHub Pages paths) on a [GitHub Pages](https://cattoface.github.io/barrcodes/site/) site

## The Skeleton
At its core, a blog is just one page with different chunks of text in the middle of the header-footer sandwich, so ideally, I will only need to manually write a single webpage.  
My HTML/CSS experience can be summed up by "I know that I need wrap text in `<div>` and use Flexbox" so with some help from Google(mostly for making divs and the logo behave with CSS...), and I've got the basic body that should suffice for all of my needs:
```html
  <body>
    <header class="header">
    <div class="logo banneritem">
    <span>B</span><span>a</span><span>r</span><span>r</span><span>C</span><span>o</span><span>d</span><span>e</span><span>s</span>
    </div>
      <a class="banneritem" href="home">Home</a>
      <a class="banneritem" href="about">About Me</a>
    </header>
    <div id="content"></div>
    <footer>
      [links and socials and stuff]
    </footer>
  </body>
```
A little bit of browsing and picking fonts and we've got the page you're looking at now(unless I changed it since the time of writing)[^1]

## Preparing Some Articles
I'm sure most would agree with me that writing Markdown is much nicer than writing articles directly in HTML so what I need is some way to convert a Markdown file to an HTML file.  
An earlier version of this site used a JS library called [marked.js](https://marked.js.org/) which can parse and convert the Markdown on the client-side browser.  
I later decided to save everyone else the little computation it costs and convert it on my side with another useful tool called [Pandoc](https://pandoc.org/), which can convert between a huge amount of text formats in the CLI.  
To convert all of the documents easily, I wrote a git pre-commit hook(surprisingly simple, simply write a bash script and save it as .git/hooks/pre-commit) to check if any of the Markdown files were modified later than their HTML counterparts, and convert it if it was. A very simple and effective system:  
```bash
#!/bin/bash
for md in documents/*.md; do
  base=$(basename $md)
  html=${base::-3}.html
  full=site/$html
  fragment=site/fragment/$html
  if [ $md -nt $full ] || [ $md -nt $fragment ]; then
    echo "Updating $base"
    pandoc $md -o $full --template full_template.html
    pandoc $md -o $fragment --template fragment_template.html
    git add $full $fragment
  else
    echo "$base Already Up To Date"
  fi
done
```
This script converts the document twice:  
Once to a full html page that contains the article, for the initial website loading.  
The [full template](https://github.com/barr-israel/barrcodes/blob/pandoc/full_template.html) combines the skeleton I built earlier with the document.
And a second time to a fragment that can be quickly embedded inside the page body, for relative navigation.  
The [fragment template](https://github.com/barr-israel/barrcodes/blob/pandoc/fragment_template.html) simply combines the metadata section with the text.  
An earlier version only had the fragment, and loaded it into a blank body on the initial load, but that solution makes it impossible to statically serve metadata headers like the title.
The full HTML pages are already enough to have a functional blog with 0 lines of JavaScript, but my goal is to make it as fast as possible to navigate, which is why I am going to need those article fragments.
And another useful trick this script enables: I can run `watch .git/hooks/pre-commit` to have the HTML regenerate when saved and served instantly on my local web server(Take that "Fast Refresh"!).

## Fetching Some Articles
The plan is to listen to any links clicked, and if they are linking to another article within the website, simple fetch and replace the body of the page instead of loading an entirely new one.  
A minimal solution to this is just a simple `click` event listener:
```javascript
content_div = document.getElementById("content")
function replace_content(doc_name) { // replace the content with the requested document
  if (doc_name == "/") doc_name = "";
  fetch("fragment/" + doc_name).then(response => response.text()).then(text=>{
    content_div.innerHTML = text
    title = document.getElementById("title")
    document.title = "BarrCodes - " + (title ? title.textContent : doc_name)
  })
}
var r = new RegExp('^(//|[a-z]+:)', 'i'); // check for relative link
document.addEventListener('click', e => { // replace relative links with document replacements
  const origin = e.target.closest('a')
  if (!origin) return; // not a link
  let doc_name = origin.getAttribute("href")
  if (r.test(doc_name) || doc_name.indexOf('.') > -1 || doc_name.charAt(0) != '#') return; // not link to a document
  e.preventDefault() // relative links do not actually load a new webpage
  if ((window.location.pathname.slice(1) || "/") == doc_name) return; // already on that page
  replace_content(doc_name)
  history.pushState({}, "", doc_name)
})
```
the `indexOf, charAt` checks are meant for linking within the website to non-documents, like to any normal file that has a dot before the extension, or the # used in reference links[^2].  
Now every relative link on the website will fetch and replace like planned.  
But of course, this is not the end, this solution has multiple things to improve upon:

- Going backwards in the browser within the website is now broken and doesn't change the content.
- Going to an article we've already visited fetches it again, which has a noticeable delay on a throttled connection, even if it is already cached.
- It can go faster

## Improving Things:
After a quick google search, I learned that to solve the backwards bug, I simply need to listen to the `popstate` event that happens when a browser goes back, and set the right document content:
```javascript
onpopstate = (_) => replace_content(window.location.pathname.slice(1) || "/") // handle back button
```
Avoiding the fetch is not much more complicated, I added a Map that saves all the documents and reuses them if available instead of fetching again:
```javascript
const cache = new Map()
function replace_content(doc_name) { // replace the content with the requested document
  let doc = cache.get(doc_name)
  if (!doc) {
    fetch("fragment/" + doc_name).then(response => response.text()).then(text=>{
      cache.set(doc_name, text)
      content_div.innerHTML = text
      title = document.getElementById("title")
      document.title = "BarrCodes - " + (title ? title.textContent : doc_name)
    })
  } else {
    content_div.innerHTML = doc
    title = document.getElementById("title")
    document.title = "BarrCodes - " + (title ? title.textContent : doc_name)
  }
}
```
And finally:

## Going Faster
This section takes the idea from the now famous [McMASTER-CARR](https://www.reddit.com/r/programming/comments/1g75r84/how_is_this_website_so_fast_breaking_down_the/) website.  
The easiest way to get to a new article faster is to simply start loading it earlier, usually we start loading a web page once a user clicks a link, but I can do better.  
Before a user clicks a link, they will almost certainly hover over it(unless they tabbed into it with their keyboard), and that gives us a heads-up that the user *might* navigate tho that page, and that's what this section exploits.  
By listening to the `mouseover` event, I can start fetching a document before the user clicks the link:
```javascript
function prefetch(doc_name) { // download the requested document if it is not already in cache
  let doc = cache.get(doc_name)
  if (!doc) {
    fetch("fragment/" + doc_name).then(response => response.text()).then(text=>cache.set(doc_name,text))
  }
}
document.addEventListener('mouseover', e => { // start fetching document on hover
  const origin = e.target.closest('a')
  if (!origin) return; // not a link
  let doc_name = origin.getAttribute("href")
  if (r.test(doc_name) || doc_name.indexOf('.') > -1 || doc_name.indexOf('#') > -1) return; // not link to a document
  if ((window.location.pathname.slice(1) || "/") == doc_name) return; // already on that page
  prefetch(doc_name)
})
```
This solution works great when the user takes a moment to decide if they want to navigate to the new page, but if they click the link immediately, there's a good chance the fetch will not finish and `replace_content` will start a second fetch, which will both cause him to download the document twice(think of all those precious bytes!) and more importantly, throw away the small time advantage I gained by fetching early.  
To solve this issue, I decided to simply store the fetch `Promise` in the cache when the user hovers over the link, and let `replace_content` check if it's a `Promise` or an actual document and behave accordingly:
```javascript
function get_document(doc_name) { // download the requested document if it is not already in cache
  let doc = cache.get(doc_name)
  if (!doc) {
    doc = fetch("fragment/" + doc_name).then(response => response.text())
    cache.set(doc_name, doc) // doc is a promise until resolved by replace_content
  }
  return doc
}
function replace_content(doc_name) { // replace the content with the requested document
  let doc = get_document(doc_name)
  if (doc instanceof Promise) { // if promise, convert to actual doc and save
    doc.then(resolved => {
      cache.set(doc_name, resolved)
      content_div.innerHTML = resolved
      title = document.getElementById("title")
      document.title = "BarrCodes - " + (title ? title.textContent : doc_name)
    })
  } else {
    content_div.innerHTML = doc
    title = document.getElementById("title")
    document.title = "BarrCodes - " + (title ? title.textContent : doc_name)
  }
}
```
`prefetch` was renamed to `get_document` since it now behaves sort of like a custom fetch.

## Final Touches
The website pretty much works as it is now but there are a few things that can be improved:

### Dark Theme
Everyone likes a dark theme option for a website(ideally by default), and it's not hard to implement at all, so here I go.  
All that is needed is a button that toggles a boolean, and a few CSS properties:
```html
<header>...<button id="toggle_theme" onclick="toggle_theme()">Dark<br/>Theme</button></header>
```
```javascript
function toggle_theme() { // toggle between dark and light theme(default dark)
  const light = document.body.classList.toggle("light")
  theme_button.innerHTML = light ? "Light<br/>Theme" : "Dark<br/>Theme"
  localStorage.setItem('light_mode', light)
}
theme_button = document.getElementById("toggle_theme")
if (localStorage.getItem("light_mode") === "true") toggle_theme(); // load saved theme
```
```CSS
.light{
  --main-bg: #EEEEEE;
  --main-text: #111111;
  --link-color: darkblue;
}
```
And it's even saved across visits!

### Reducing The Latency A Little More

- Looking at the browser's network tab, there was a noticeable latency fetching the CSS for the fonts from [Google Fonts](https://fonts.google.com/), but not so much fetching the fonts themselves, so I simply copied the content of the CSS into my own CSS file and that solved it and improved the latency.

- Initially, I put the `<script>` tag at the end of the body of the HTML file, which causes it to be parsed and executed last, this was needed because it is not possible to interact with the DOM and insert a document into the body before the DOM actually loads.
The current solution puts the script in the `<head>` of the HTML, and uses a `DOMContentLoaded` event to do only the things that require the DOM happen after it's loaded:
```javascript
window.addEventListener("DOMContentLoaded", _ => {
  content_div = document.getElementById("content")
  theme_button = document.getElementById("toggle_theme")
  if (localStorage.getItem("light_mode") === "true") toggle_theme(); // load saved theme
  replace_content(window.location.pathname.slice(1) || "/") // load current doc
})
```
I was not actually able to measure a statistically significant difference from this change, but I kept it anyway, someone else can probably explain what is the best practice for this.

## Deployment
Finally, I need to actually host this website somewhere, I decided to go with [Cloudflare Pages](https://pages.cloudflare.com/), I already use them for my other domain(just for DNS) and I have no complaints.  
There is not much to talk about that isn't in their getting started documentation, I connected the GitHub repository and now every push to the preview or production branches and Cloudflare automatically redeploys the website(which only includes cloning it and distributing it over their network, since this is a static website).  

## Unexplained Behaviour
A surprising behavior I found while finalizing the website design, is that if I have an active Zoom call in another tab, having my `onhover` listener adds a significant delay before the following click can load the page.  
Disabling the `onhover` listener or clicking a link without hovering first(i.e using the keyboard) still fetches and displays the document quickly.  
This behaviour goes back to normal the moment the call ends.--
I can find absolutely no explanation for this behaviour.

## Summary
As expected, I don't actually need any frameworks to build a basic and performant blog, or even a lot of JavaScript, the [script.js](https://github.com/barr-israel/barrcodes/blob/pandoc/site/script.js) file is exactly 56 lines long, without any unreadable minification.[^3]  
Of course modern frameworks have upsides compared to this, there is also [Hugo](https://gohugo.io/), the static website generator written in Go, which pretty much does exactly what I'm doing with `pandoc` plus a few more web and blog oriented features, but I wanted to see what I can do with as little as possible, it's possible that I'll switch to it in the future.  
Sure, it could be nicer, it could have a dynamic home page that doesn't need to be updated when a new article is published, it could have a comments system so other people can more easily send feedback([giscus](https://giscus.app/) looks like an interesting solution, might add it to all articles later as part of the `pandoc` templates).  

[^1]:I lied a little, font picking and the footer design happened after implementing the document system but I'd rather keep all the design writing together.
[^2]:This was actually added as I was testing this post and learning that the `script.js` link and the reference links are broken.
[^3]:The name of this article changed a couple times to reflect small late changes, I hoped I could keep it at a nice 50, but it is what it is.

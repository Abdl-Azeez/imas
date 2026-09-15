function renderStructuredResponse(response) {
  const wrap = document.createElement("div");
  response.sections.forEach(section => {
    const sec = document.createElement("div");
    sec.className = "resp-section";
    if (section.label) {
      const label = document.createElement("div");
      label.className = "resp-label";
      label.textContent = section.label;
      sec.appendChild(label);
    }
    if (section.text) {
      const text = document.createElement("div");
      text.className = "resp-text";
      text.textContent = section.text;
      sec.appendChild(text);
    }
    if (section.code) sec.appendChild(buildCodeBlock(section.code, section.codeLang || "text"));
    wrap.appendChild(sec);
  });
  return wrap;
}

function renderStructuredResponseProgressive(response, wrap, onComplete) {
  const sections = response.sections || [];
  let sectionIndex = 0;

  function revealNextSection() {
    if (sectionIndex >= sections.length) {
      onComplete?.();
      return;
    }
    const section = sections[sectionIndex++];
    const element = document.createElement("div");
    element.className = "resp-section response-reveal";
    wrap.appendChild(element);
    if (section.label) {
      const label = document.createElement("div");
      label.className = "resp-label";
      label.textContent = section.label;
      element.appendChild(label);
    }
    if (section.text) {
      const text = document.createElement("div");
      text.className = "resp-text";
      element.appendChild(text);
      typeText(text, section.text, () => {
        if (section.code) element.appendChild(buildCodeBlock(section.code, section.codeLang || "text"));
        setTimeout(revealNextSection, 180);
      });
      return;
    }
    if (section.code) element.appendChild(buildCodeBlock(section.code, section.codeLang || "text"));
    setTimeout(revealNextSection, 180);
  }

  revealNextSection();
}

function typeText(element, text, done) {
  let index = 0;
  const step = () => {
    element.textContent = text.slice(0, index);
    if (index < text.length) {
      index += 1;
      setTimeout(step, text.length > 240 ? 8 : 16);
    } else {
      done();
    }
  };
  step();
}

function buildCodeBlock(code, lang) {
  const wrap = document.createElement("div");
  wrap.className = "code-block";
  const head = document.createElement("div");
  head.className = "code-block-head";
  const langLabel = document.createElement("span");
  langLabel.textContent = lang.toUpperCase();
  const copyButton = document.createElement("button");
  copyButton.className = "copy-btn";
  copyButton.textContent = "Copy";
  copyButton.addEventListener("click", () => {
    copyTextToClipboard(code);
    copyButton.textContent = "Copied";
    copyButton.classList.add("copied");
    setTimeout(() => {
      copyButton.textContent = "Copy";
      copyButton.classList.remove("copied");
    }, 1600);
  });
  head.append(langLabel, copyButton);
  const pre = document.createElement("pre");
  const codeElement = document.createElement("code");
  codeElement.innerHTML = highlightCode(code, lang);
  pre.appendChild(codeElement);
  wrap.append(head, pre);
  return wrap;
}

function highlightCode(code, lang) {
  let escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (lang === "python") {
    escaped = escaped.replace(/(#.*)/g, '<span class="cmt">$1</span>');
    escaped = escaped.replace(/(&quot;.*?&quot;|"[^"]*"|'[^']*')/g, '<span class="str">$1</span>');
    escaped = escaped.replace(/\b(def|if|elif|else|for|while|in|return|import|from|print|input|int|float|str|True|False|None|and|or|not)\b/g, '<span class="kw">$1</span>');
    escaped = escaped.replace(/\b(\d+)\b/g, '<span class="num">$1</span>');
  } else if (lang === "sql") {
    escaped = escaped.replace(/\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|AND|OR|ORDER BY|GROUP BY)\b/gi, '<span class="kw">$1</span>');
    escaped = escaped.replace(/('[^']*')/g, '<span class="str">$1</span>');
  } else if (lang === "pseudocode") {
    escaped = escaped.replace(/\b(DECLARE|OUTPUT|INPUT|IF|THEN|ELSE|ENDIF|FOR|TO|NEXT|WHILE|ENDWHILE|INTEGER|STRING|REAL|BOOLEAN)\b/g, '<span class="kw">$1</span>');
  }
  return escaped;
}

function plainTextFromResponse(response) {
  return response.sections.map(section => {
    let text = section.label ? section.label.toUpperCase() + "\n" : "";
    if (section.text) text += section.text + "\n";
    if (section.code) text += section.code + "\n";
    return text;
  }).join("\n").trim();
}

function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  else fallbackCopy(text);
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try { document.execCommand("copy"); } catch {}
  textarea.remove();
}

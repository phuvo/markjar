/**
 * @param {HTMLElement} editor
 */
function Markjar(editor, options) {
	const { hljs, morphdom } = options;

	hljs.registerLanguage('promptmark', PromptMark);

	const highlight = (text) => {
		return hljs.highlight(text, { language: 'promptmark' }).value;
	};

	/**
	 * @param {HTMLElement} lineEl
	 */
	const formatLine = (lineEl) => {
		const text = lineEl.textContent;
		const html = highlight(text);
		morphdom(lineEl, `<div class="mj-line">${html}</div>`);
	};

	editor.classList.add('markjar');
	editor.contentEditable = 'true';
	editor.innerHTML = '<div class="mj-line"></div>';

	editor.addEventListener('input', event => {
		if (event.inputType === 'insertText') {
			const position = getCursorPos(editor);
			const lineEl = editor.children[position.line];
			formatLine(lineEl);
			setCursorPos(editor, position);
		}
		else if (event.inputType === 'insertParagraph') {
			// Do nothing
		}
	});
}


/**
 * @param {HTMLElement} editor
 */
function getCursorPos(editor) {
	const selection = window.getSelection();
	const range = selection.getRangeAt(0);

	const lineEl = range.endContainer.nodeName === 'DIV'
		? range.endContainer
		: range.endContainer.parentElement.closest('div');
	const line = Array.prototype.indexOf.call(editor.children, lineEl);

	const preRange = range.cloneRange();
	preRange.selectNodeContents(lineEl);
	preRange.setEnd(range.endContainer, range.endOffset);
	const column = preRange.toString().length;

	return { line, column };
}


/**
 * @param {HTMLElement} editor
 */
function setCursorPos(editor, pos) {
	const selection = window.getSelection();
	const range = document.createRange();

	const lineEl = editor.children[pos.line];
	moveCursorToColumn(lineEl, pos.column, range);

	selection.removeAllRanges();
	selection.addRange(range);
}


/**
 * @param {HTMLElement} element
 * @param {number} column
 * @param {Range} range
 */
function moveCursorToColumn(element, column, range) {
	let offset = 0;
	let found = false;

	const walkNode = (node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent;
			if (offset + text.length >= column) {
				moveTo(node);
				found = true;
			} else {
				offset += text.length;
			}
		} else {
			for (const child of node.childNodes) {
				if (found) break;
				walkNode(child);
			}
		}
	};

	const moveTo = (node) => {
		const sibling = node.nextSibling;
		if (sibling?.classList.contains('mj-set-cursor')) {
			range.setEnd(sibling, 0);
		} else {
			range.setEnd(node, column - offset);
		}
		range.collapse();
	};

	walkNode(element);
}


/**
 * @param {number} timeout
 */
function debounce(fn, timeout) {
	let id;
	return (...args) => {
		cancelIdleCallback(id);
		id = requestIdleCallback(() => fn(...args), { timeout });
	};
}


function PromptMark() {
	const H1_HASH = {
		className: 'section mj-hash mj-h1-hash',
		match: /^# /,
	};
	const H1_CONTENT = {
		className: 'section mj-h1-content',
		match: /(?<=^# )[^\n]+/,
	};
	const HASH = {
		className: ' mj-hash',
		match: /^#+/,
	};
	return {
		name: 'PromptMark',
		contains: [
			H1_HASH,
			H1_CONTENT,
			HASH,
		],
	};
}


export default Markjar;

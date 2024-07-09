import hljs from 'highlight.js/lib/core';
import morphdom from 'morphdom';


/**
 * @param {HTMLElement} editor
 */
function Markjar(editor, options) {
	const service = options?.languageService || new LanguageService();


	const updateText = (text) => {
		const textLines = text.split('\n');
		for (let i = 0; i < textLines.length; i++) {
			if (textLines[i] !== editor.children[i]?.textContent) {
				const newLine = service.createLine(textLines[i]);
				if (i < editor.children.length) {
					editor.replaceChild(newLine, editor.children[i]);
				} else {
					editor.appendChild(newLine);
				}
			}
		}
		while (editor.children.length > textLines.length) {
			editor.removeChild(editor.lastChild);
		}
	};


	const setText = (text) => {
		const pos = getCursorPos(editor);
		updateText(text);
		setCursorPos(editor, pos);
	};


	const getText = () => {
		return Array.from(editor.children).map(line => line.textContent).join('\n');
	};


	editor.classList.add('markjar');
	editor.contentEditable = 'true';
	editor.innerHTML = '<div class="mj-line"></div>';


	const changedLines = new Set();


	const updateChangedLines = debounce(() => {
		const pos = getCursorPos(editor);
		changedLines.forEach(line => {
			const newLine = service.updateLine(line.textContent);
			morphdom(line, newLine);
		});
		changedLines.clear();
		setCursorPos(editor, pos);
	}, 50);


	editor.addEventListener('beforeinput', event => {
		const lines = getChangedLines(event, editor);
		if (lines.length > 0) {
			changedLines.add(...lines);
			updateChangedLines();
		}
	});


	return {
		setText,
		getText,
	};
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
		const sibling = node.parentElement.nextSibling;
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


/**
 * @param {InputEvent} event
 * @param {HTMLElement} editor
 * @returns {HTMLElement[]}
 */
function getChangedLines(event, editor) {
	return event.getTargetRanges().flatMap(range => {
		if (event.inputType === 'insertText') {
			const parentElement = range.startContainer.nodeName === '#text'
				? range.startContainer.parentElement
				: range.startContainer;
			const line = parentElement.closest('div');
			return [line];
		}

		console.log('getChangedLines', event.inputType, range);
		return [];
	});
}


function PromptMark() {
	const H1_HASH = {
		className: 'section mj-hash mj-h1-hash mj-block',
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


function LanguageService() {
	hljs.registerLanguage('promptmark', PromptMark);


	const highlight = (text) => {
		return hljs.highlight(text, { language: 'promptmark' }).value;
	};


	const createLine = (text) => {
		const line = document.createElement('div');
		line.className = 'mj-line';
		line.innerHTML = highlight(text);
		return line;
	};


	const updateLine = (text) => {
		const newLine = createLine(text);
		if (newLine.lastChild?.classList?.contains('mj-block')) {
			newLine.insertAdjacentHTML('beforeend', '<span class="mj-set-cursor"></span>');
		}
		return newLine;
	};


	return {
		createLine,
		updateLine,
	};
}


export { Markjar, LanguageService };

import hljs from 'highlight.js/lib/core';
import morphdom from 'morphdom';


interface CursorPos {
	line: number;
	column: number;
}


export class Markjar {
	constructor(private editor: HTMLElement) {
		editor.contentEditable = 'true';
		editor.innerHTML = '<div class="mj-line"></div>';
		editor.classList.add('markjar');
		editor.addEventListener('beforeinput', this.#onBeforeInput);
	}


	getText() {
		return Array.from(this.editor.children).map(line => line.textContent).join('\n');
	}


	setText(text: string) {
		const pos = this.#getCursorPos();
		this.#updateText(text);
		this.#setCursorPos(pos);
	}


	#updateText(text: string) {
		const textLines = text.split('\n');
		for (let i = 0; i < textLines.length; i++) {
			if (textLines[i] !== this.editor.children[i]?.textContent) {
				const newLine = createLine(textLines[i]);
				if (i < this.editor.children.length) {
					this.editor.replaceChild(newLine, this.editor.children[i]);
				} else {
					this.editor.appendChild(newLine);
				}
			}
		}
		while (this.editor.children.length > textLines.length) {
			this.editor.removeChild(this.editor.lastChild!);
		}
	}


	#getCursorPos(): CursorPos | null {
		const selection = window.getSelection();
		if (!selection) {
			return null;
		}

		const range = selection.getRangeAt(0);
		const element = this.#getLineElement(range.startContainer);
		if (!element) {
			return null;
		}

		const preRange = range.cloneRange();
		preRange.selectNodeContents(element);
		preRange.setEnd(range.endContainer, range.endOffset);

		const line = Array.prototype.indexOf.call(this.editor.children, element);
		const column = preRange.toString().length;

		return { line, column };
	}


	#setCursorPos(pos: CursorPos | null) {
		const selection = window.getSelection();
		const range = document.createRange();

		if (!pos || !selection) {
			return;
		}

		const validLine = Math.min(Math.max(pos.line, 0), this.editor.children.length - 1);
		const element = this.editor.children[validLine];
		moveCursorToColumn(element as HTMLElement, pos.column, range);

		selection.removeAllRanges();
		selection.addRange(range);
	}


	#onBeforeInput = (event: InputEvent) => {
		const ranges = event.getTargetRanges();
		console.assert(ranges.length === 1);

		const line = this.#getLineElement(ranges[0].startContainer);
		if (line) {
			this.#changedLines.add(line);
			this.#requestForUpdate();
		}
	};


	#getLineElement(node: Node) {
		if (node === this.editor) {
			return null;
		}
		if (!node.parentElement) {
			return null;
		}
		if (node.parentElement === this.editor) {
			return node;
		}
		return node.parentElement.closest('div');
	}


	#changedLines = new Set<Node>();


	#requestForUpdate = makeIdle(() => {
		const pos = this.#getCursorPos();

		this.#changedLines.forEach(line => {
			if (line.parentElement !== this.editor) {
				console.warn('Line not in editor', line);
				return;
			}
			const newLine = updateLine(line.textContent || '');
			morphdom(line, newLine);
		});
		this.#changedLines.clear();

		this.editor.querySelectorAll(':scope > br').forEach(br => {
			this.editor.replaceChild(createLine(''), br);
		});

		this.#setCursorPos(pos);
	}, 100);
}


function moveCursorToColumn(element: HTMLElement, column: number, range: Range) {
	let offset = 0;
	let found = false;

	const walkNode = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent!;
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

	const moveTo = (node: Node) => {
		const sibling = node.parentElement!.nextSibling;
		if (sibling && shouldSetCursor(sibling)) {
			range.setEnd(sibling, 0);
		} else {
			range.setEnd(node, column - offset);
		}
		range.collapse();
	};

	if (element.textContent!.length === 0) {
		range.setEnd(element, 0);
		range.collapse();
	} else {
		walkNode(element);
	}
}


function makeIdle<F extends (...args: Parameters<F>) => void>(fn: F, timeout: number) {
	let id: number;
	return (...args: Parameters<F>) => {
		cancelIdleCallback(id);
		id = requestIdleCallback(() => fn(...args), { timeout });
	};
}


function doHighlight(text: string) {
    return hljs.highlight(text, { language: 'promptmark' }).value;
}


function createLine(text: string) {
    const line = document.createElement('div');
    line.className = 'mj-line';
    line.innerHTML = text ? doHighlight(text) : '<br>';
    return line;
}


function updateLine(text: string) {
    const newLine = createLine(text);
	if (newLine.lastChild && isFixedWidthBlock(newLine.lastChild)) {
        newLine.insertAdjacentHTML('beforeend', '<span class="mj-cursor"></span>');
    }
    return newLine;
}


function isFixedWidthBlock(node: Node) {
	return node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).classList.contains('mj-block');
}


function shouldSetCursor(node: Node) {
	return node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).classList.contains('mj-cursor');
}


function PromptMark() {
	const H1_HASH = {
		className: 'section mj-hash mj-h1-hash mj-block',
		match: /^# /,
	};
	const H2_HASH = {
		className: 'section mj-hash mj-h2-hash mj-block',
		match: /^## /,
	};
	const H3_HASH = {
		className: 'section mj-hash mj-h3-hash mj-block',
		match: /^### /,
	};
	const HASH = {
		className: ' mj-hash',
		match: /^#+/,
	};
	const HEADER_TEXT = {
		className: 'section',
		match: /(?<=^#+ )[^\n]+/,
	};

	const OL_LIST_D1 = {
		className: 'bullet mj-bullet mj-ol-list-d1 mj-block',
		match: /^\d\. /,
	};
	const OL_LIST_DX = {
		className: 'bullet mj-bullet mj-ol-list-dx mj-block',
		match: /^\d+\. /,
	};
	const UL_LIST = {
		className: 'bullet mj-bullet mj-ul-list mj-block',
		match: /^[*+-] /,
	};
	const BULLET = {
		className: ' mj-bullet',
		match: /^([*+-]|(\d+\.))/,
	};

	return {
		name: 'PromptMark',
		contains: [
			H1_HASH,
			H2_HASH,
			H3_HASH,
			HASH,
			HEADER_TEXT,

			OL_LIST_D1,
			OL_LIST_DX,
			UL_LIST,
			BULLET,
		],
	};
}

hljs.registerLanguage('promptmark', PromptMark);

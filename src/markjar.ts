import hljs from 'highlight.js/lib/core';
import morphdom from 'morphdom';


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
		const range = this.getSelectionRange();
		this.#updateText(text);
		this.setSelectionRange(range);
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


	getSelectionRange(): SelectionRange | null {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return null;
		}

		const range = selection.getRangeAt(0);
		const start = this.#calculateTextPos(range.startContainer, range.startOffset);
		if (!start) {
			return null;
		}

		const end = range.collapsed ? null : this.#calculateTextPos(range.endContainer, range.endOffset);
		return { start, end };
	}


	setSelectionRange(range: SelectionRange | null) {
		const selection = window.getSelection();
		const newRange = document.createRange();

		if (!selection || !range) {
			return;
		}

		const startPos = this.#calculateNodePos(range.start);
		if (!startPos) {
			return;
		}
		newRange.setStart(startPos.node, startPos.offset);

		const endPos = range.end ? this.#calculateNodePos(range.end) : null;
		if (endPos) {
			newRange.setEnd(endPos.node, endPos.offset);
		} else {
			newRange.collapse(true);
		}

		selection.removeAllRanges();
		selection.addRange(newRange);
	}


	#onBeforeInput = (event: InputEvent) => {
		const ranges = event.getTargetRanges();
		console.assert(ranges.length === 1);

		const lineNode = this.#getLineNode(ranges[0].startContainer);
		if (lineNode) {
			this.#changedLines.add(lineNode);
			this.#requestForUpdate();
		}
	};


	#getLineNode(node: Node) {
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
		const range = this.getSelectionRange();

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

		this.setSelectionRange(range);
	}, 100);


	#calculateTextPos(node: Node, offset: number): TextPos | null {
		const lineNode = this.#getLineNode(node);
		if (!lineNode) {
			return null;
		}

		const range = document.createRange();
		range.selectNodeContents(lineNode);
		range.setEnd(node, offset);

		const line = Array.prototype.indexOf.call(this.editor.childNodes, lineNode);
		const column = range.toString().length;
		return { line, column };
	}


	#calculateNodePos(pos: TextPos): NodePos | null {
		const lineNode = this.editor.childNodes[pos.line];
		if (!lineNode) {
			return null;
		}

		if (lineNode.textContent!.length === 0) {
			return { node: lineNode, offset: 0 };
		}

		let offset = 0;
		const walkNode = (node: Node): NodePos | null => {
			if (node.nodeType === Node.TEXT_NODE) {
				const text = node.textContent!;
				if (offset + text.length >= pos.column) {
					return getTarget(node);
				}
				offset += text.length;
			} else {
				for (const child of node.childNodes) {
					const result = walkNode(child);
					if (result) {
						return result;
					}
				}
			}
			return null;
		};
		const getTarget = (node: Node): NodePos => {
			const sibling = node.parentElement!.nextSibling;
			if (sibling && shouldSetCursor(sibling)) {
				return { node: sibling, offset: 0 };
			}
			return { node, offset: pos.column - offset };
		};
		return walkNode(lineNode);
	}
}


interface TextPos {
	line: number;
	column: number;
}


interface NodePos {
	node: Node;
	offset: number;
}


interface SelectionRange {
	start: TextPos;
	end: TextPos | null;
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

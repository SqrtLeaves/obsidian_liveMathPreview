import {
	Plugin,
	renderMath,
	finishRenderMath,
	editorLivePreviewField,
	editorEditorField,
} from 'obsidian';
import { StateField, Transaction, Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

function rangesHaveOverlap(
	ranges: readonly { from: number; to: number }[],
	from: number,
	to: number
): boolean {
	for (const range of ranges) {
		if (range.from <= to && range.to >= from) return true;
	}
	return false;
}

class InlineMathPreviewWidget extends WidgetType {
	constructor(private source: string) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const container = document.createElement('div');
		container.addClass('inline-math-preview-container');

		const mathEl = renderMath(this.source, false);
		container.appendChild(mathEl);

		// Flush MathJax typesetting asynchronously
		setTimeout(() => finishRenderMath(), 0);

		return container;
	}

	eq(other: InlineMathPreviewWidget): boolean {
		return this.source === other.source;
	}
}

export const inlineMathPreviewField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},

	update(prev: DecorationSet, tr: Transaction): DecorationSet {
		const { state } = tr;

		// Only activate in Live Preview mode
		let isLivePreview = false;
		try {
			isLivePreview = state.field(editorLivePreviewField, false) ?? false;
		} catch (e) {
			isLivePreview = false;
		}
		if (!isLivePreview) {
			return Decoration.none;
		}

		// Avoid interfering with IME composition
		let view: EditorView | null = null;
		try {
			view = state.field(editorEditorField, false) ?? null;
		} catch (e) {
			view = null;
		}
		if (view && view.composing) {
			return prev.map(tr.changes);
		}

		const doc = state.doc;
		const ranges = view && view.hasFocus ? state.selection.ranges : [];
		const tree = syntaxTree(state);
		const decorations: Range<Decoration>[] = [];

		let mathBegin = -1;
		let mathContentBegin = -1;
		let isBlock = false;

		tree.iterate({
			enter(node) {
				if (node.name.includes('formatting-math-begin')) {
					mathBegin = node.from;
					mathContentBegin = node.to;
					isBlock = node.name.includes('math-block');
				} else if (mathBegin !== -1) {
					if (node.name.includes('formatting-math-end')) {
						const mathContentEnd = node.from;
						const mathEnd = node.to;

						// Only show preview for inline math when cursor is inside
						if (!isBlock && rangesHaveOverlap(ranges, mathBegin, mathEnd)) {
							const source = doc.sliceString(mathContentBegin, mathContentEnd);
							decorations.push(
								Decoration.widget({
									widget: new InlineMathPreviewWidget(source),
									block: true,
									side: 1,
								}).range(mathEnd, mathEnd)
							);
						}

						mathBegin = -1;
						mathContentBegin = -1;
						isBlock = false;
					}
				}
			},
		});

		return Decoration.set(decorations, true);
	},

	provide(field) {
		return EditorView.decorations.from(field);
	},
});

export default class InlineMathPreviewPlugin extends Plugin {
	async onload() {
		this.registerEditorExtension(inlineMathPreviewField);
	}
}

import {
	Plugin,
	renderMath,
	finishRenderMath,
	editorLivePreviewField,
	editorEditorField,
	PluginSettingTab,
	Setting,
	MarkdownView,
} from 'obsidian';
import type { EditorState } from '@codemirror/state';
import { StateField, Transaction, StateEffect } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

// ── Settings ──

interface InlineMathPreviewSettings {
	enabled: boolean;
	popupLeft: number;
	popupTop: number;
	fontSize: number;
	backgroundColor: string;
}

const DEFAULT_SETTINGS: InlineMathPreviewSettings = {
	enabled: true,
	popupLeft: 0,
	popupTop: 0,
	fontSize: 16,
	backgroundColor: 'var(--background-primary)',
};

// ── CodeMirror state effect for enabling/disabling ──

const setInlineMathPreviewEnabled = StateEffect.define<boolean>();

// ── Helpers ──

interface MathRange {
	from: number;
	to: number;
	source: string;
	mathEnd: number;
}

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

function collectNativeMathRanges(state: EditorState): MathRange[] {
	const doc = state.doc;
	const tree = syntaxTree(state);
	const ranges: MathRange[] = [];
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
					if (!isBlock) {
						ranges.push({
							from: mathBegin,
							to: mathEnd,
							source: doc.sliceString(mathContentBegin, mathContentEnd),
							mathEnd,
						});
					}
					mathBegin = -1;
					mathContentBegin = -1;
					isBlock = false;
				}
			}
		},
	});

	return ranges;
}

// ── ViewPlugin (floating popup preview) ──

function buildInlineMathPreviewViewPlugin(plugin: InlineMathPreviewPlugin) {
	const defaultEnabled = plugin.settings.enabled;

	const enabledField = StateField.define<boolean>({
		create() {
			return defaultEnabled;
		},
		update(value, tr) {
			for (const effect of tr.effects) {
				if (effect.is(setInlineMathPreviewEnabled)) {
					return effect.value;
				}
			}
			return value;
		},
	});

	const viewPlugin = ViewPlugin.fromClass(
		class {
			popup: HTMLElement;
			lastActiveMath: MathRange | null = null;
			editorView: EditorView;
			isDragging: boolean = false;
			dragStartX: number = 0;
			dragStartY: number = 0;
			popupStartX: number = 0;
			popupStartY: number = 0;
			onMouseMove: (e: MouseEvent) => void;
			onMouseUp: () => void;

			constructor(view: EditorView) {
				this.editorView = view;
				this.popup = document.createElement('div');
				this.popup.classList.add('inline-math-preview-popup');
				this.popup.style.display = 'none';
				document.body.appendChild(this.popup);

				this.onMouseMove = (e: MouseEvent) => {
					if (!this.isDragging) return;
					const newLeft = this.popupStartX + (e.clientX - this.dragStartX);
					const newTop = this.popupStartY + (e.clientY - this.dragStartY);
					this.popup.style.left = `${newLeft}px`;
					this.popup.style.top = `${newTop}px`;
				};

				this.onMouseUp = () => {
					if (!this.isDragging) return;
					this.isDragging = false;
					this.popup.classList.remove('is-dragging');
					plugin.settings.popupLeft = parseInt(this.popup.style.left || '0', 10);
					plugin.settings.popupTop = parseInt(this.popup.style.top || '0', 10);
					plugin.saveSettings();
				};

				this.popup.addEventListener('mousedown', (e) => {
					this.isDragging = true;
					this.dragStartX = e.clientX;
					this.dragStartY = e.clientY;
					this.popupStartX = parseInt(this.popup.style.left || '0', 10);
					this.popupStartY = parseInt(this.popup.style.top || '0', 10);
					this.popup.classList.add('is-dragging');
					e.preventDefault();
				});

				document.addEventListener('mousemove', this.onMouseMove);
				document.addEventListener('mouseup', this.onMouseUp);
			}

			update(update: ViewUpdate) {
				const { state } = update;

				let enabled: boolean;
				try {
					enabled = state.field(enabledField);
				} catch (e) {
					enabled = defaultEnabled;
				}
				if (!enabled) {
					this.popup.style.display = 'none';
					this.lastActiveMath = null;
					return;
				}

				// Only show preview in Live Preview mode
				const isLivePreview = state.field(editorLivePreviewField, false) ?? false;
				if (!isLivePreview) {
					this.popup.style.display = 'none';
					this.lastActiveMath = null;
					return;
				}

				const ranges = update.view.hasFocus ? state.selection.ranges : [];
				const nativeRanges = collectNativeMathRanges(state);

				let activeMath: MathRange | null = null;
				for (const math of nativeRanges) {
					if (rangesHaveOverlap(ranges, math.from, math.to)) {
						activeMath = math;
						break;
					}
				}

				this.lastActiveMath = activeMath;

				if (activeMath) {
					while (this.popup.firstChild) {
						this.popup.removeChild(this.popup.firstChild);
					}
					const mathEl = renderMath(activeMath.source.trim(), false);
					this.popup.appendChild(mathEl);
					setTimeout(() => finishRenderMath(), 0);

					// Apply current style settings
					this.popup.style.fontSize = `${plugin.settings.fontSize}px`;
					this.popup.style.backgroundColor = plugin.settings.backgroundColor;

					// Defer coordinate reading until after layout is done
					update.view.requestMeasure({
						read: (view) => {
							const target = this.lastActiveMath;
							if (!target) return null;
							return {
								endCoords: view.coordsAtPos(target.mathEnd),
								beginCoords: view.coordsAtPos(target.from),
							};
						},
						write: (result) => {
							if (!result || !this.lastActiveMath) {
								this.popup.style.display = 'none';
								return;
							}
							const { endCoords, beginCoords } = result;
							const baseLeft = beginCoords ? beginCoords.left : (endCoords ? endCoords.left : 0);
							const baseTop = beginCoords ? beginCoords.top : (endCoords ? endCoords.bottom + 4 : 0);

							// Use saved absolute position when not dragging; fallback to default below-math on first use
							if (!this.isDragging) {
								if (plugin.settings.popupLeft === 0 && plugin.settings.popupTop === 0) {
									this.popup.style.left = `${baseLeft}px`;
									this.popup.style.top = `${baseTop}px`;
								} else {
									this.popup.style.left = `${plugin.settings.popupLeft}px`;
									this.popup.style.top = `${plugin.settings.popupTop}px`;
								}
							}
							this.popup.style.display = 'block';
						},
					});
				} else {
					this.popup.style.display = 'none';
				}
			}

			destroy() {
				document.removeEventListener('mousemove', this.onMouseMove);
				document.removeEventListener('mouseup', this.onMouseUp);
				this.popup.remove();
			}
		}
	);

	return { extensions: [enabledField, viewPlugin], viewPlugin };
}

// ── Setting Tab ──

class InlineMathPreviewSettingTab extends PluginSettingTab {
	plugin: InlineMathPreviewPlugin;

	constructor(app: any, plugin: InlineMathPreviewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Enable inline math preview')
			.setDesc('Show a floating preview popup when the cursor is inside inline math in Live Preview mode.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
					this.plugin.setEnabled(value);
				})
			);

		new Setting(containerEl)
			.setName('Preview font size')
			.setDesc('Font size of the preview popup in pixels.')
			.addSlider((slider) =>
				slider
					.setLimits(10, 32, 1)
					.setValue(this.plugin.settings.fontSize)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.setFontSize(value);
					})
			);

		new Setting(containerEl)
			.setName('Preview background color')
			.setDesc('Background color of the preview popup.')
			.addColorPicker((picker) =>
				picker
					.setValue(this.plugin.settings.backgroundColor)
					.onChange(async (value) => {
						this.plugin.setBackgroundColor(value);
					})
			);
	}
}

// ── Main Plugin ──

export default class InlineMathPreviewPlugin extends Plugin {
	settings: InlineMathPreviewSettings = DEFAULT_SETTINGS;
	extensions: any[] = [];
	viewPluginRef: ReturnType<typeof ViewPlugin.fromClass> | null = null;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new InlineMathPreviewSettingTab(this.app, this));

		this.addCommand({
			id: 'toggle-inline-math-preview',
			name: 'Toggle inline math preview',
			callback: () => {
				this.toggleEnabled();
			},
		});

		const built = buildInlineMathPreviewViewPlugin(this);
		this.extensions = built.extensions;
		this.viewPluginRef = built.viewPlugin;
		this.registerEditorExtension(this.extensions);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	setEnabled(value: boolean) {
		if (this.settings.enabled === value) return;
		this.settings.enabled = value;
		this.saveSettings();

		const leaves = this.app.workspace.getLeavesOfType('markdown');
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView) {
				const cm = (view.editor as any).cm as EditorView | undefined;
				if (cm) {
					cm.dispatch({ effects: setInlineMathPreviewEnabled.of(value) });
				}
			}
		}
	}

	setFontSize(value: number) {
		this.settings.fontSize = value;
		this.saveSettings();
		this.refreshPopupStyles();
	}

	setBackgroundColor(value: string) {
		this.settings.backgroundColor = value;
		this.saveSettings();
		this.refreshPopupStyles();
	}

	private refreshPopupStyles() {
		if (!this.viewPluginRef) return;
		const leaves = this.app.workspace.getLeavesOfType('markdown');
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView) {
				const cm = (view.editor as any).cm as EditorView | undefined;
				if (cm) {
					const instance = cm.plugin(this.viewPluginRef) as { popup: HTMLElement } | null;
					if (instance) {
						instance.popup.style.fontSize = `${this.settings.fontSize}px`;
						instance.popup.style.backgroundColor = this.settings.backgroundColor;
					}
				}
			}
		}
	}

	toggleEnabled() {
		this.setEnabled(!this.settings.enabled);
	}
}

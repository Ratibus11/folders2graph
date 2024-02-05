import { Plugin, WorkspaceLeaf } from "obsidian";

import { GraphLeafWithCustomRenderer } from "interfaces/GraphLeafWithCustomRenderer";
import { RendererData } from "interfaces/RendererData";

import { Nullable } from "types/Nullable";

const FOLDER_NODE_TAG = "tag";

export default class Main extends Plugin {
	/**
	 * Triggered when the plugin is loaded.
	 */
	override async onload(): Promise<void> {
		// Iterates through all tabs which are of type "graph".
		this.refreshGraphLeaves();

		// When a leaf changes, refresh all graph leaves.
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf: Nullable<WorkspaceLeaf>) => {
				this.refreshGraphLeaves([leaf as GraphLeafWithCustomRenderer]);
			}),
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.refreshGraphLeaves();
			}),
		);
	}

	/**
	 * Triggered when the plugin is unloaded.
	 */
	override onunload(): void {
		this.getLeavesOfTypeGraph().forEach((leaf) => {
			// Restablish the original data setter in the render, then delete the custom on, then reload the leaf.
			if (leaf.view.renderer.originalSetData) {
				leaf.view.renderer.setData = leaf.view.renderer.originalSetData;

				delete leaf.view.renderer.originalSetData;

				leaf.view.unload();
				leaf.view.load();
			}
		});
	}

	/**
	 * Refreshes the provided graph leaves.
	 * @param leaves The leaves to refresh. If not provided, all graph leaves will be refreshed.
	 * @note If a leaf is not a graph, it will be ignored.
	 */
	private refreshGraphLeaves(leaves: GraphLeafWithCustomRenderer[] = this.getLeavesOfTypeGraph()): void {
		leaves.forEach((leaf) => {
			if (leaf.view.getViewType() === "graph") {
				this.injectDataInLeaf(leaf);
				leaf.view.unload();
				leaf.view.load();
			}
		});
	}

	/**
	 * Renders the graph leaf with a custom renderer.
	 * @param leaf The graph leaf to render.
	 */
	private injectDataInLeaf(leaf: GraphLeafWithCustomRenderer): void {
		const renderer = leaf.view.renderer;

		// Store the original data setter in another property, then override the data setter with a custom one.
		if (renderer.originalSetData == undefined) {
			renderer.originalSetData = renderer.setData;
		}

		// Define the custom data setter.
		renderer.setData = (data: RendererData) => {
			const folders = new Set("/");

			// Get all folders of the nodes. Uses the ID of the node.
			// eg. file "folder/subfolder/file.md" will generate the following folders: "/", "/folder", "/folder/subfolder
			Object.entries(data.nodes).forEach(([nodeId, nodeData]) => {
				const nodeSubFolders = this.getNodeParentFolders(nodeId);

				if (!nodeData.folderNode && nodeData.type != FOLDER_NODE_TAG && nodeSubFolders != null) {
					nodeSubFolders.forEach(folders.add, folders);
				}
			});

			// Add a node for each folder.
			folders.forEach((folder) => {
				data.nodes[folder] = {
					type: FOLDER_NODE_TAG,
					links: {},
					folderNode: true,
				};
			});

			// Add the links between the nodes and the folders.
			Object.entries(data.nodes).forEach(([nodeId, nodeData]) => {
				if (nodeData.type != FOLDER_NODE_TAG || nodeData.folderNode) {
					const directParent = this.getNodeParentFolder(nodeId);
					data.nodes[directParent].links[nodeId] = true;
				}
			});

			if (!renderer.originalSetData) {
				throw new Error("originalSetData is undefined.");
			}

			return renderer.originalSetData(data);
		};
	}

	/**
	 * Get all leaves of type "graph".
	 * @returns The leaves of type "graph".
	 */
	private getLeavesOfTypeGraph(): GraphLeafWithCustomRenderer[] {
		return this.app.workspace.getLeavesOfType("graph") as GraphLeafWithCustomRenderer[];
	}

	/**
	 * Get the parent folders of a node.
	 * @param nodeId The ID of the node.
	 * @returns Will return each folder and subfolder of the node.
	 * @example
	 * const nodeId = "folder/subfolder/file.md";
	 * const result = getNodeParentFolders(nodeId);
	 * // result = ["/", "/folder", "/folder/subfolder"]
	 */
	private getNodeParentFolders(nodeId: string): string[] {
		const subFolders = ["/"];

		const splittedNodeId = nodeId.split("/");
		const subFoldersSteps = splittedNodeId.slice(0, splittedNodeId.length - 1);

		let currentFolder = "";
		subFoldersSteps.forEach((subfolder) => {
			currentFolder += "/" + subfolder;
			subFolders.push(currentFolder);
		});

		return subFolders;
	}

	/**
	 * Get the parent folder of a node.
	 * @param nodeId The ID of the node.
	 * @returns The parent folder of the node.
	 * @example
	 * const nodeId = "folder/subfolder/file.md";
	 * const result = getNodeParentFolder(nodeId);
	 * // result = "/folder/subfolder"
	 */
	private getNodeParentFolder(nodeId: string): string {
		const splittedNodeId = nodeId.split("/");
		const subFoldersSteps = splittedNodeId.slice(0, splittedNodeId.length - 1).filter((e) => e != "");

		return `/${subFoldersSteps.join("/")}`;
	}
}

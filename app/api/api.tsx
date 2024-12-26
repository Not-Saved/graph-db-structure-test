import type { Route } from "./+types/api";
import * as go from "gojs";

import {
	addToNodeXChildY,
	deleteAll,
	deleteNode,
	getAllNodesAncestorsOf,
	getAllNodesDescendantsOf,
	insertNode,
	query,
	removeFromNodeXChildY,
} from "./db2.server";
import { ReactDiagram } from "gojs-react";
import { Form, useFetcher } from "react-router";
import { useEffect, useRef } from "react";

export async function loader({ request }: Route.LoaderArgs) {
	let url = new URL(request.url);
	let desc = url.searchParams.get("node_key");
	let type = url.searchParams.get("type");
	let nodeType = url.searchParams.get("node_type");

	const nodes = await query`SELECT * from nodes`;

	const edges = await query`SELECT * from edges`;

	let nodesChildOfRoot = [];
	if (desc) {
		if (type === "ancestor") {
			nodesChildOfRoot = await getAllNodesAncestorsOf(desc, nodeType ? nodeType.split(",") : undefined);
		} else {
			nodesChildOfRoot = await getAllNodesDescendantsOf(desc, nodeType ? nodeType.split(",") : undefined);
		}
	}

	return {
		nodes: nodes || [],
		edges: edges,
		nodesChildOfRoot: nodesChildOfRoot,
	};
}

export async function action({ request }: Route.ActionArgs) {
	if (request.url.includes("/delete-single")) {
		let data = await request.formData();
		let node_key = data.get("node_key") as string;
		if (node_key === "1") return { ok: false, error: new Error("Cannot delete root node") };
		try {
			await deleteNode(node_key);
			return { ok: true, error: null };
		} catch (error) {
			return { ok: false, error };
		}
	} else if (request.url.includes("/insert")) {
		let data = await request.formData();
		let type = data.get("type") as string;
		try {
			await insertNode({ type: type || "generic" });
			return { ok: true, error: null };
		} catch (error) {
			return { ok: false, error };
		}
	} else if (request.url.includes("/add-as-child")) {
		let data = await request.formData();
		let from_id = data.get("from_id") as string;
		let to_id = data.get("to_id") as string;
		try {
			await addToNodeXChildY(from_id, to_id);
			return { ok: true, error: null };
		} catch (error) {
			return { ok: false, error };
		}
	} else if (request.url.includes("/remove-from-child")) {
		let data = await request.formData();
		let from_id = data.get("from_id") as string;
		let to_id = data.get("to_id") as string;
		try {
			await removeFromNodeXChildY(from_id, to_id);
			return { ok: true, error: null };
		} catch (error) {
			return { ok: false, error };
		}
	} else if (request.url.includes("/delete-all")) {
		try {
			await deleteAll();
			return { ok: true, error: null };
		} catch (error) {
			return { ok: false, error };
		}
	}
}

export default function Component({ loaderData }: Route.ComponentProps) {
	const { nodes, edges, nodesChildOfRoot } = loaderData;
	const diagramRef = useRef<go.Diagram | null>(null);
	const nodeDataArray = nodes.map((node) => ({
		key: node.id,
		text: `${node.id} - ${node.type}`,
		color: !nodesChildOfRoot.find((el) => el.id === node.id) ? "lightblue" : "#DD0033AA",
	}));

	const linkDataArray = edges.map((edge, i) => ({
		key: -i,
		from: Number(edge.from_id),
		to: Number(edge.to_id),
		color: edge.type === "adjacent" ? "red" : "green",
	}));

	useEffect(() => {
		if (diagramRef.current) {
			// Auto-arrange the nodes
		}
	}, [nodes, edges]);
	return (
		<>
			<div className="fixed z-20 bg-slate-100 m-10 top-0 right-0 p-4 rounded-sm">
				<GetDescendantsForm />
				<InsertForm />
				<DeleteForm />
				<AddAsChildForm />
				<RemoveFromChildForm />
				<DeleteAll />
			</div>
			<ReactDiagram
				initDiagram={() => initDiagram(diagramRef)}
				divClassName="size-full"
				nodeDataArray={nodeDataArray}
				linkDataArray={linkDataArray}
			/>
		</>
	);
}

function GetDescendantsForm() {
	return (
		<Form method="get" className="flex flex-col" action="/api/descendants">
			<h2>Get descendants</h2>
			<fieldset>
				<legend>Type</legend>
				<label>
					<input type="radio" name="type" value="ancestor" />
					Ancestor
				</label>
				<label>
					<input type="radio" name="type" value="descendant" />
					Descendant
				</label>
			</fieldset>

			<input placeholder="node_key" type="text" name="node_key" />
			<input placeholder="type" type="text" name="node_type" />
			<button>Get</button>
			{/* 	{fetcher.state !== "idle" && <p>Saving...</p>}
			{fetcher.data?.error && <p style={{ color: "red" }}>{fetcher.data.error.message}</p>} */}
		</Form>
	);
}

function InsertForm() {
	let fetcher = useFetcher();

	return (
		<fetcher.Form method="post" className="" action="/api/insert">
			<h2>Insert node</h2>
			<input placeholder="type" type="text" name="type" />
			{fetcher.state !== "idle" && <p>Saving...</p>}
			{fetcher.data?.error && <p style={{ color: "red" }}>{fetcher.data.error.message}</p>}
		</fetcher.Form>
	);
}

function DeleteForm() {
	let fetcher = useFetcher();

	return (
		<fetcher.Form method="post" className="" action="/api/delete-single">
			<h2>Delete node</h2>
			<input placeholder="node_key" type="text" name="node_key" />
			{fetcher.state !== "idle" && <p>Saving...</p>}
			{fetcher.data?.error && <p style={{ color: "red" }}>{fetcher.data.error.message}</p>}
		</fetcher.Form>
	);
}

function AddAsChildForm() {
	let fetcher = useFetcher();

	return (
		<fetcher.Form method="post" className="flex flex-col" action="/api/add-as-child">
			<h2>Add child as node</h2>
			<input placeholder="from_id" type="text" name="from_id" />
			<input placeholder="to_id" type="text" name="to_id" />
			<button type="submit">Add as child</button>
			{fetcher.state !== "idle" && <p>Saving...</p>}
			{fetcher.data?.error && <p style={{ color: "red" }}>{fetcher.data.error.message}</p>}
		</fetcher.Form>
	);
}

function RemoveFromChildForm() {
	let fetcher = useFetcher();

	return (
		<fetcher.Form method="post" className="flex flex-col" action="/api/remove-from-child">
			<h2>Remove child from node</h2>
			<input placeholder="from_id" type="text" name="from_id" />
			<input placeholder="to_id" type="text" name="to_id" />
			<button type="submit">Remove from child</button>
			{fetcher.state !== "idle" && <p>Saving...</p>}
			{fetcher.data?.error && <p style={{ color: "red" }}>{fetcher.data.error.message}</p>}
		</fetcher.Form>
	);
}

function DeleteAll() {
	let fetcher = useFetcher();

	return (
		<fetcher.Form method="post" className="flex flex-col" action="/api/delete-all">
			<button type="submit">DeleteAll</button>
			{fetcher.state !== "idle" && <p>Saving...</p>}
			{fetcher.data?.error && <p style={{ color: "red" }}>{fetcher.data.error.message}</p>}
		</fetcher.Form>
	);
}

function initDiagram(diagramRef: React.RefObject<go.Diagram | null>) {
	// set your license key here before creating the diagram: go.Diagram.licenseKey = "...";
	const diagram = new go.Diagram({
		"undoManager.isEnabled": true, // must be set to allow for model change listening
		// 'undoManager.maxHistoryLength': 0,  // uncomment disable undo/redo functionality
		"clickCreatingTool.archetypeNodeData": { text: "new node", color: "lightblue" },
		model: new go.GraphLinksModel({
			linkKeyProperty: "key", // IMPORTANT! must be defined for merges and data sync when using GraphLinksModel
		}),
		scale: 2,
	});
	diagramRef.current = diagram;
	// define a simple Node template
	diagram.nodeTemplate = new go.Node("Auto") // the Shape will go around the TextBlock
		.bindTwoWay("location", "loc", go.Point.parse, go.Point.stringify)
		.add(
			new go.Shape("RoundedRectangle", { name: "SHAPE", fill: "white", strokeWidth: 0 }) // default fill is white; the Shape.stroke value is specified by the Node.data.color property)
				// Shape.fill is bound to Node.data.color
				.bind("fill", "color"),
			new go.TextBlock({ margin: 8, editable: true }) // some room around the text
				.bindTwoWay("text")
		);
	// Define a simple Link template
	diagram.linkTemplate = new go.Link().add(
		new go.Shape() // the link shape
			.bind("stroke", "color"), // bind the stroke color to the color property in the link data
		new go.Shape({ toArrow: "Standard" }) // the arrowhead
			.bind("stroke", "color") // bind the stroke color to the color property in the link data
			.bind("fill", "color") // bind the fill color to the color property in the link data
	);
	return diagram;
}

import connect, { sql, type DatabaseTransaction, type SQLQuery } from '@databases/sqlite';

// We don't pass a file name here because we don't want to store
// anything on disk
const db = connect();
async function prepare(numNodes: number, numEdges: number) {
	try {
		await db.query(sql`
			CREATE TABLE IF NOT EXISTS nodes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type VARCHAR NOT NULL,
			name VARCHAR,
			props TEXT -- JSON data column
			);
		`);
		await db.query(sql`
			CREATE TABLE IF NOT EXISTS edges (
				from_id VARCHAR NOT NULL,
				to_id VARCHAR NOT NULL,
				type VARCHAR NOT NULL,
				PRIMARY KEY (from_id, to_id)
			);
		`);
		// Insert initial nodes
		const nodeInserts = [];
		for (let i = 1; i <= numNodes; i++) {
			nodeInserts.push(sql`('type')`);
		}

		await db.query(sql`
				INSERT INTO nodes (type) VALUES
				${sql.join(nodeInserts, sql`, `)};
			`);

		// Insert initial edges
		const edgeInserts = [];
		for (let i = 1; i <= numEdges; i++) {
			const fromId = Math.round(i / 2);
			const toId = (i % numNodes) + 1; // Ensure toId wraps around within the range of node IDs
			edgeInserts.push(sql`(${fromId}, ${toId}, 'adjacent')`);
		}
		await db.query(sql`
					INSERT INTO edges (from_id, to_id, type) VALUES
					${sql.join(edgeInserts, sql`, `)};
				`);

	} catch (err) {
		console.error(err);
	}

}
const prepared = prepare(1000, 999);

export async function query(query: TemplateStringsArray, ...values: Array<any>) {
	try {
		await prepared;
		const start = performance.now()
		const res = await db.query(sql(query, ...values))
		const duration = performance.now() - start
		console.log('executed query', { duration, res: res?.length })
		return res
	} catch (err) {
		console.error("query", err);
		throw err;
	}
}
async function transaction<T = unknown>(query: (db: DatabaseTransaction) => Promise<T>) {
	try {
		await prepared;
		const start = performance.now()
		const res = await db.tx(query)
		const duration = performance.now() - start
		console.log('executed query', { duration, })
		return res
	} catch (err) {
		console.error("transaction", err);
		throw err;
	}
}


type Node = {
	type: string,
	props?: JSON
}

export async function insertNode({ type, props }: Node) {
	try {
		await query`
			INSERT INTO nodes(type, props) VALUES(${type}, ${JSON.stringify(props)});
		`;
	} catch (err) {
		console.error(err);
		throw err;
	}
}

export async function addToNodeXChildY(parentNodeId: string, childNodeId: string) {
	await transaction(async (tx) => {
		await tx.query(sql`
			INSERT INTO edges(from_id, to_id, type) VALUES(${parentNodeId}, ${childNodeId}, 'adjacent')
			ON CONFLICT(from_id, to_id) DO UPDATE SET type = excluded.type;
		`);
	});
}


export async function removeFromNodeXChildY(parentNodeId: string, childNodeId: string) {
	await transaction(async (tx) => {
		await tx.query(sql`
			DELETE FROM edges WHERE from_id = ${parentNodeId} AND to_id = ${childNodeId};
		`);
	});
}

export async function deleteNode(node_key: string) {

	await transaction(async (tx) => {
		await tx.query(sql`
			DELETE FROM nodes WHERE id = ${node_key};
		`);
	});
}

export async function deleteAll() {
	try {
		await query`
			DELETE FROM nodes WHERE id <> 1;
		`;
	} catch (err) {
		console.error(err);
		throw err;
	}
}

export async function getAllNodesDescendantsOf(id: string, types?: string[]) {
	try {
		const typeQueries: SQLQuery[] = types ? types.map(type => sql`${type} `) : [];
		const queryS = query`
			WITH RECURSIVE children AS(
			SELECT ${id} AS to_id
				UNION
				SELECT to_id
				FROM edges
				WHERE from_id = ${id} AND type = 'adjacent'
				UNION
				SELECT e.to_id
				FROM edges e
				INNER JOIN children c ON e.from_id = c.to_id
				WHERE e.type = 'adjacent'
		)
			SELECT n.*
			FROM nodes n
			INNER JOIN children c ON n.id = c.to_id
			${types && types.length > 0 ? sql`WHERE n.type IN (${sql.join(typeQueries, sql`, `)})` : sql``};
		`;
		return await queryS;
	} catch (err) {
		console.error("getAllNodesDescendantsOf", err);
		throw err;
	}
}

export async function getAllNodesAncestorsOf(id: string, types?: string[]) {

	try {
		const typeQueries: SQLQuery[] = types ? types.map(type => sql`${type} `) : [];
		const queryS = query`
			WITH RECURSIVE parents AS(
			SELECT ${id} AS from_id
				UNION
				SELECT from_id
				FROM edges
				WHERE to_id = ${id} AND type = 'adjacent'
				UNION
				SELECT e.from_id
				FROM edges e
				INNER JOIN parents p ON e.to_id = p.from_id
				WHERE e.type = 'adjacent'
		)
			SELECT n.*
			FROM nodes n
			INNER JOIN parents p ON n.id = p.from_id
		 	${types && types.length > 0 ? sql`WHERE n.type IN (${sql.join(typeQueries, sql`, `)})` : sql``};
		`;
		return await queryS;
	} catch (err) {
		console.error("getAllNodesAncestorsOf", err);
		throw err;
	}
}
import pg, { type PoolClient } from 'pg'
const { Pool } = pg

const pool = new Pool({ host: "localhost", port: 5432, database: "test", user: "app", password: "app" })

export async function query(text: string, params?: any) {
	const start = Date.now()
	const res = await pool.query(text, params)
	const duration = Date.now() - start
	//console.log('executed query', { text, duration, rows: res.rowCount })
	return res
}

export const getClient = async () => {
	const client: PoolClient & { lastQuery?: any } = await pool.connect()
	const query = client.query
	const release = client.release
	// set a timeout of 5 seconds, after which we will log this client's last query
	const timeout = setTimeout(() => {
		console.error('A client has been checked out for more than 5 seconds!')
		console.error(`The last executed query on this client was: ${client.lastQuery}`)
	}, 5000)
	// monkey patch the query method to keep track of the last query executed

	client.query = (...args: any) => {
		client.lastQuery = args
		return query.apply(client, args)
	}
	client.release = () => {
		// clear our timeout
		clearTimeout(timeout)
		// set the methods back to their old un-monkey-patched version
		client.query = query
		client.release = release
		return release.apply(client)
	}
	return client
}

type Node = {
	name: string,
	props?: JSON
}

export async function insertNode({ name, props }: Node) {
	try {
		await query('INSERT INTO nodes (name,props) VALUES ($1,$2)', [name, props])
	} catch (err) {
		console.error(err)
		throw err
	}
}

export async function addNodeAsChild(parentNodeId: string, childNodeId: string) {
	const client = await getClient()
	// Start a transaction
	await client.query('BEGIN');

	try {
		await addNodeAsChildQueries(client, parentNodeId, childNodeId);
		// Commit the transaction
		await client.query('COMMIT');
	} catch (error) {
		// Rollback the transaction in case of error
		console.log(error);
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

export async function addNodeAsChildQueries(client: pg.PoolClient, parentNodeId: string, childNodeId: string) {
	// Insert the adjacent edge from parentNodeId to childNodeId
	await client.query(`
		INSERT INTO edges (from_id, to_id, type) VALUES ($1, $2, $3) 
		ON CONFLICT (from_id, to_id) DO UPDATE SET type = EXCLUDED.type`,
		[parentNodeId, childNodeId, "adjacent"]);

	/* 	await client.query(`
				WITH ancestors AS (
					SELECT from_id
					FROM edges
					WHERE to_id = $1
					UNION
					SELECT $1
				),
				descendants AS (
					SELECT to_id
					FROM edges
					WHERE from_id = $2
					UNION
					SELECT $2
				)
				INSERT INTO edges (from_id, to_id, type)
				SELECT a.from_id, d.to_id, 'ancestor'
				FROM ancestors a, descendants d
				ON CONFLICT (from_id, to_id) DO NOTHING
			`, [parentNodeId, childNodeId]); */
}

export async function deleteNode(node_key: string) {
	const client = await getClient();
	// Start a transaction
	await client.query('BEGIN');

	try {
		/* 	// Step 1: Take all the node's parents via any edge of the deleted node
			const { rows: parents } = await client.query('SELECT DISTINCT from_id FROM edges WHERE to_id = $1', [node_key]);
	
			// Step 2: Take all the node's children via any edge of the deleted node
			const { rows: children } = await client.query('SELECT DISTINCT to_id FROM edges WHERE from_id = $1', [node_key]);
	
			// Step 3: Delete all the edges of type 'ancestor' between the parents and children found in steps 1 and 2
			await client.query(`
				DELETE FROM edges
				WHERE type = 'ancestor'
				AND (from_id, to_id) IN (
					SELECT p.from_id, c.to_id
					FROM edges p
					JOIN edges c ON p.to_id = $1 AND c.from_id = $1
				)
			`, [node_key]);
	 */
		// Step 4: Delete the node itself (edges will be deleted automatically due to cascade delete)
		await client.query('DELETE FROM nodes WHERE id = $1', [node_key]);

		/* 	// Step 5: Take the children found in step 2 and find their parents via edges of type 'adjacent'
			for (const child of children) {
				const { rows: newParents } = await client.query('SELECT DISTINCT from_id FROM edges WHERE to_id = $1 AND type = $2', [child.to_id, 'adjacent']);
	
				// Step 6: Reconnect the children with the parents found in step 5 using the function addNodeAsChild
				for (const newParent of newParents) {
					await addNodeAsChildQueries(client, newParent.from_id, child.to_id);
				}
			} */

		// Commit the transaction
		await client.query('COMMIT');
	} catch (error) {
		// Rollback the transaction in case of error
		console.error(error);
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}
export async function deleteAll() {
	try {
		await query('DELETE FROM nodes WHERE id <> 1')
	} catch (err) {
		console.error(err)
		throw err
	}
}

export async function getAllNodesChildOf(id: string) {
	try {
		const queryS = `
            WITH RECURSIVE children AS (
            SELECT $1 AS to_id
            UNION
            SELECT to_id
            FROM edges
            WHERE from_id = $1 AND type = 'adjacent'
            UNION
            SELECT e.to_id
            FROM edges e
            INNER JOIN children c ON e.from_id = c.to_id
            WHERE e.type = 'adjacent'
        )
       SELECT n.*
        FROM nodes n
        INNER JOIN children c ON n.id = c.to_id;
    `;
		return await query(queryS, [id]);

	} catch (err) {
		console.error(err)
		throw err
	}
}
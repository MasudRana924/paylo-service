const { pool } = require("../config/db");
const getExistingAllUsers = async (limit = 10, offset = 0) => {
    const result = await pool.query(`
        SELECT users.id,users.phone,users.name,
        json_build_object(
        'id', wallets.id,
        'balance', wallets.balance,
        'status', wallets.status
        ) as wallet
        FROM users
        INNER JOIN wallets ON users.id=wallets.user_id
        LIMIT $1 OFFSET $2
        `, [limit, offset]);
    return result.rows;
};



const userWalletStatusUpdate=async(walletId,status)=>{

    const result = await pool.query(`
        UPDATE wallets
        SET status = $1
        WHERE id = $2
        RETURNING *
    `, [status, walletId]);
    return result.rows[0];


}

const getExistingAllUsersTransactions = async (limit = 10, offset = 0) => {
    const result = await pool.query(
    `
    SELECT 
        transactions.id,
        transactions.amount,
        transactions.transaction_type,
        transactions.status,
        transactions.created_at,

        json_build_object(
            'id', receiver_users.id,
            'phone', receiver_users.phone,
            'name', receiver_users.name,
            'user_type', receiver_users.user_type
        ) AS receiver,

        json_build_object(
            'id', sender_users.id,
            'phone', sender_users.phone,
            'name', sender_users.name,
            'user_type', sender_users.user_type
        ) AS sender

    FROM transactions

    INNER JOIN users AS receiver_users
        ON transactions.receiver_id = receiver_users.id

    INNER JOIN users AS sender_users
        ON transactions.sender_id = sender_users.id

    ORDER BY transactions.created_at DESC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset]
);
    return result.rows;
}

module.exports = {
    getExistingAllUsers,
    getExistingAllUsersTransactions,
    userWalletStatusUpdate
};

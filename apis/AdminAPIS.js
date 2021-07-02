const uuid = require('uuid').v4
const { getSecureConnection, getConnection, getTransactionalConnection } = require('../services/mySqlAdmin')
const { sendEmail } = require('../services/mailer')
const { uploader, s3 } = require('../services/uploader')

const URL = 'http://ec2-52-15-148-90.us-east-2.compute.amazonaws.com'

module.exports = app => {
    app.get('/secureTest', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT * FROM users WHERE id = 1`,
            null,
            (data) => {
                return res.send(data[0])
            }
        )
    })

    app.post('/admin/login', async (req, res) => {
        const { email, password } = req.body
        if (!email) return res.status(422).send({ 'msg': 'Email is required!' })
        if (!password) return res.status(422).send({ 'msg': 'Password is required!' })
        getConnection(
            res,
            `SELECT U.id, U.name, U.email, U.role, U.restaurantId, R.restaurantName
            FROM users U
            LEFT JOIN restaurants R on U.restaurantId = R.restaurantId
            WHERE U.email = '${lowerCased(email)}' AND U.password = BINARY '${password}' AND active = 1`,
            null,
            (data) => {
                if (data.length)
                    return res.send(data[0])
                else
                    return res.status(422).send({ 'msg': `Invalid credentials provided or, User is in-active` })
            }
        )
    })

    app.post('/admin/forgotPassword', async (req, res) => {
        const { email } = req.body
        if (!email) return res.status(422).send({ 'msg': 'Email is required!' })
        const hashString = Math.random().toString(36).substring(2);
        getConnection(
            res,
            `UPDATE users SET ? WHERE email = '${lowerCased(email)}'`,
            { passwordForgotten: 1, hashString },
            (result) => {
                if (result.changedRows) {
                    getConnection(
                        res,
                        `SELECT restaurantId FROM users WHERE email = '${lowerCased(email)}'`,
                        null,
                        async (result) => {
                            if (result && result.length) {
                                const emailStatus = await sendEmail(
                                    email,
                                    'Reset Password Link',
                                    forgotPasswordMessage(`${URL}/client/createPassword/${result[0].restaurantId || null}/${email}/${hashString}`)
                                )
                                if (emailStatus && emailStatus.accepted.length) return res.send({ 'msg': 'Password Reset Link Sent!' })
                                else return res.status(422).send({ 'msg': `Invalid Email: "${email}"!` })
                            }
                            else return res.status(422).send({ 'msg': 'Email not registered' })
                        }
                    )
                }
                else return res.status(422).send({ 'msg': 'Email not registered' })
            }
        )
    })

    app.post('/admin/createPassword', async (req, res) => {
        const { email, password, hashString } = req.body
        if (!email) return res.status(422).send({ 'msg': 'Email is required!' })
        if (!password) return res.status(422).send({ 'msg': 'Password is required!' })
        if (!hashString) return res.status(422).send({ 'msg': 'Invalid hashString!' })
        let sql = `UPDATE users SET ? WHERE email = '${lowerCased(email)}' `
        sql += `AND passwordForgotten = 1 `
        sql += `AND hashString = '${hashString}'`
        getConnection(
            res,
            sql,
            { password, passwordForgotten: 0 },
            (result) => {
                if (result.changedRows)
                    return res.send({ 'msg': 'Password Updated Successfully!' })
                else return res.status(422).send({ 'msg': 'Link Expired!' })
            }
        )
    })

    app.get('/admin/getSuperAdminDashboard', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT (SELECT COUNT(*) FROM restaurants) as restaurants,
            (SELECT COUNT(*) FROM users WHERE role = 'Admin') as admins,
            (SELECT COUNT(*) FROM restaurantsQrs) as qrs
            FROM users WHERE id = ${adminId} AND role = 'SuperAdmin'`,
            null,
            (data) => {
                if (data.length) {
                    return res.send(data[0])
                } else {
                    return res.status(422).send({ 'msg': 'Dashboard data not available!' })
                }
            }
        )
    })

    app.post('/admin/addRestuarant', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId, imageUrl, restaurantName, cuisine, address, city, country, latitude, longitude, taxId, taxPercentage, customMessage, primaryContact, secondaryContact } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Slug is required!' })
        if (!restaurantName) return res.status(422).send({ 'msg': 'Restaurant Name is required!' })
        if (!address) return res.status(422).send({ 'msg': 'Address is required!' })
        if (!city) return res.status(422).send({ 'msg': 'City is required!' })
        if (!country) return res.status(422).send({ 'msg': 'Country is required!' })
        if (!taxId) return res.status(422).send({ 'msg': 'Tax Id is required!' })
        if (!taxPercentage) return res.status(422).send({ 'msg': 'Tax percentage is required!' })
        if (!primaryContact) return res.status(422).send({ 'msg': 'Primary Contact fields are required!' })
        if (!primaryContact.name) return res.status(422).send({ 'msg': 'Primary Contact\'s Name is required!' })
        if (!primaryContact.email) return res.status(422).send({ 'msg': 'Primary Contact\'s Email is required!' })
        if (secondaryContact) {
            if (!secondaryContact.name) return res.status(422).send({ 'msg': 'Secondary Contact\'s Name is required!' })
            if (!secondaryContact.email) return res.status(422).send({ 'msg': 'Secondary Contact\'s Email is required!' })
        }

        getTransactionalConnection()
            .getConnection(function (error, tempDb) {
                if (!!error) {
                    console.log('DbConnectionError', error.sqlMessage)
                    return res.status(503).send({ 'msg': 'Unable to reach database!' })
                }

                tempDb.query(`SELECT * FROM users WHERE id = '${adminId}' AND role = 'SuperAdmin' AND active = 1`, (error, authResult) => {
                    if (!!error) return res.status(422).send({ 'msg': error.sqlMessage })
                    if (authResult.length) {
                        tempDb.beginTransaction(function (error) {
                            if (!!error) {
                                console.log('TransactionError', error.sqlMessage)
                                return res.status(422).send({ 'msg': error.sqlMessage })
                            }
                            let hashString = Math.random().toString(36).substring(2);
                            const restaurant = {}
                            restaurant.restaurantId = restaurantId
                            restaurant.imageUrl = imageUrl
                            restaurant.restaurantName = restaurantName
                            if (cuisine)
                                restaurant.cuisine = cuisine
                            restaurant.address = address
                            restaurant.city = city
                            restaurant.country = country
                            if (latitude)
                                restaurant.latitude = latitude
                            if (longitude)
                                restaurant.longitude = longitude
                            restaurant.taxId = taxId
                            restaurant.taxPercentage = taxPercentage
                            if (customMessage)
                                restaurant.customMessage = customMessage

                            let data = primaryContact
                            data.email = lowerCased(primaryContact.email)
                            data.restaurantId = restaurantId
                            data.hashString = hashString
                            tempDb.query('INSERT INTO users SET ?', data, async function (error, result) {
                                if (!!error) {
                                    console.log('TableError', error.sqlMessage)
                                    tempDb.rollback(function () {
                                        return res.status(422).send({ 'msg': "Failed to create user!" })
                                    })
                                } else {
                                    restaurant.primaryContactId = result.insertId
                                    let emailStatus = await sendEmail(
                                        primaryContact.email,
                                        'Create Password',
                                        setPasswordMessage(
                                            primaryContact.name,
                                            restaurantName,
                                            `${URL}/client/createPassword/${restaurantId}/${primaryContact.email}/${hashString}`
                                        )
                                    )
                                    if (emailStatus && emailStatus.accepted.length) {
                                        if (secondaryContact) {
                                            data = secondaryContact
                                            data.email = lowerCased(secondaryContact.email)
                                            data.restaurantId = restaurantId
                                            hashString = Math.random().toString(36).substring(2);
                                            data.hashString = hashString
                                            tempDb.query('INSERT INTO users SET ?', data, async function (error, result) {
                                                if (!!error) {
                                                    console.log('TableError', error.sqlMessage)
                                                    tempDb.rollback(function () {
                                                        return res.status(422).send({ 'msg': "Failed to create user!" })
                                                    })
                                                } else {
                                                    restaurant.secondaryContactId = result.insertId
                                                    emailStatus = await sendEmail(
                                                        secondaryContact.email,
                                                        'Create Password',
                                                        setPasswordMessage(
                                                            secondaryContact.name,
                                                            restaurantName,
                                                            `${URL}/client/createPassword/${restaurantId}/${secondaryContact.email}/${hashString}`
                                                        )
                                                    )
                                                    if (emailStatus && emailStatus.accepted.length)
                                                        tempDb.query('INSERT INTO restaurants SET ?', restaurant, function (error) {
                                                            if (!!error) {
                                                                console.log('TableError', error.sqlMessage)
                                                                tempDb.rollback(function () {
                                                                    return res.status(422).send({ 'msg': "Failed to create restaurant!" })
                                                                })
                                                            } else {
                                                                tempDb.commit(function (error) {
                                                                    if (error) {
                                                                        tempDb.rollback(function () {
                                                                            return res.status(422).send({ 'msg': error.sqlMessage })
                                                                        })
                                                                    }
                                                                    tempDb.release()
                                                                    return res.send({
                                                                        'msg': 'Restuarant Added Successfully!'
                                                                    })
                                                                })
                                                            }
                                                        })
                                                    else tempDb.rollback(function () {
                                                        return res.status(422).send({ 'msg': `Invalid Email: "${secondaryContact.email}"!` })
                                                    })
                                                }
                                            })
                                        } else {
                                            tempDb.query('INSERT INTO restaurants SET ?', restaurant, function (error) {
                                                if (!!error) {
                                                    console.log('TableError', error.sqlMessage)
                                                    tempDb.rollback(function () {
                                                        return res.status(422).send({ 'msg': error.sqlMessage })
                                                    })
                                                } else {
                                                    tempDb.commit(function (error) {
                                                        if (error) {
                                                            tempDb.rollback(function () {
                                                                return res.status(422).send({ 'msg': error.sqlMessage })
                                                            })
                                                        }
                                                        tempDb.release()
                                                        return res.send({
                                                            'msg': 'Restuarant Added Successfully!'
                                                        })
                                                    })
                                                }
                                            })
                                        }
                                    }
                                    else tempDb.rollback(function () {
                                        return res.status(422).send({ 'msg': `Invalid Email: "${primaryContact.email}"!` })
                                    })
                                }
                            })
                        })
                    }
                    else return res.status(401).send({ 'msg': 'Invalid Session!' })
                })
            })
    })

    app.post('/admin/getRestaurantToEdit', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant ID is required!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT restaurantId, restaurantName, cuisine,
            address, city, country, latitude, longitude,
            taxId, taxPercentage, customMessage,
            primaryContactId, secondaryContactId
            FROM restaurants WHERE restaurantId = '${restaurantId}'`,
            null,
            (data) => {
                if (data.length) {
                    return res.send(data[0])
                } else {
                    return res.status(422).send({ 'msg': 'Reastaurant not available!' })
                }
            }
        )
    })

    app.post('/admin/updateRestaurant', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId, updatedData } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant ID is required!' })
        if (!updatedData) return res.status(422).send({ 'msg': 'No field submitted to update!' })
        getSecureConnection(
            res,
            adminId,
            `UPDATE restaurants SET ? WHERE restaurantId = '${restaurantId}'`,
            updatedData,
            (result) => {
                if (result.changedRows) {
                    return res.send({ msg: 'Restaurant Updated Successfully!' })
                } else {
                    return res.status(422).send({ 'msg': 'Failed to update reastaurant!' })
                }
            }
        )
    })

    app.get('/admin/getAllRestaurants', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT R.restaurantId, R.restaurantName, R.cuisine, R.city, 
            (SELECT COUNT(*) FROM restaurantsQrs RQ WHERE RQ.restaurantId = R.restaurantId) as qrCounts 
            FROM restaurants R 
            ORDER BY R.createdAt DESC`,
            null,
            (data) => {
                if (data.length) {
                    return res.send(data)
                } else {
                    return res.status(422).send({ 'msg': 'No reastaurants available!' })
                }
            }
        )
    })

    app.post('/admin/generateQrs', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId, values } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        if (!values || !values.length) return res.status(422).send({ 'msg': 'QR values required!' })

        getTransactionalConnection()
            .getConnection(function (error, tempDb) {
                if (!!error) {
                    console.log('DbConnectionError', error.sqlMessage)
                    return res.status(503).send({ 'msg': 'Unable to reach database!' })
                } else {
                    tempDb.query(`SELECT * FROM users WHERE id = '${adminId}' AND role = 'SuperAdmin' AND active = 1`, (error, authResult) => {
                        if (!!error) return res.status(422).send({ 'msg': error.sqlMessage })
                        if (authResult.length) {
                            tempDb.beginTransaction(function (error) {
                                if (!!error) {
                                    console.log('TransactionError', error.sqlMessage)
                                    return res.status(422).send({ 'msg': error.sqlMessage })
                                }

                                let query = 'INSERT INTO restaurantsQrs ( restaurantId, value ) VALUES'
                                for (var i = 0; i < values.length; i++) {
                                    query = query + ` ( '${restaurantId}', '${values[i]}' )`
                                    if (i !== (values.length - 1))
                                        query = query + ','
                                }
                                tempDb.query(query, function (error) {
                                    if (!!error) {
                                        console.log('TableError', error.sqlMessage)
                                        tempDb.rollback(function () {
                                            return res.status(422).send({ 'msg': error.sqlMessage })
                                        })
                                    } else {
                                        tempDb.commit(function (error) {
                                            if (error) {
                                                tempDb.rollback(function () {
                                                    return res.status(422).send({ 'msg': error.sqlMessage })
                                                })
                                            }
                                            tempDb.release()
                                            return res.send({
                                                'msg': 'QRs Generated Successfully!'
                                            })
                                        })
                                    }
                                })
                            })
                        }
                        else return res.status(401).send({ 'msg': 'Invalid Session!' })
                    })
                }
            })
    })

    app.post('/admin/getExistingQrs', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT id, tableName, value, active FROM restaurantsQrs WHERE restaurantId = '${restaurantId}'`,
            null,
            (data) => {
                if (data.length) {
                    return res.send(data)
                } else {
                    return res.status(422).send({ 'msg': 'No QRs available!' })
                }
            }
        )
    })

    app.post('/admin/setTableName', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { id, tableName } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!id) return res.status(422).send({ 'msg': 'Table Id is required!' })
        getSecureConnection(
            res,
            adminId,
            `UPDATE restaurantsQrs SET ? WHERE id = ${id}`,
            { tableName },
            (result) => {
                if (result.changedRows)
                    return res.send({ 'msg': 'Table Name Updated Successfully!' })
                else return res.status(422).send({ 'msg': 'Invalid Table ID!' })
            }
        )
    })

    app.get('/admin/getAllUsers', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT u.id, u.name, u.email, u.contactNumber, u.role, u.active, r.restaurantName
            FROM users u
            JOIN restaurants r ON u.restaurantId = r.restaurantId
            WHERE role <> 'SuperAdmin'
            ORDER BY r.createdAt DESC, u.createdAt ASC `,
            null,
            (data) => {
                if (data.length) {
                    return res.send(data)
                } else {
                    return res.status(422).send({ 'msg': 'No users available!' })
                }
            }
        )
    })

    app.post('/admin/getRestaurantDashboard', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT rq.id, rq.tableName, rq.value, rq.mergeId,
            SUM(o.doNotDisturb) as doNotDisturb,
            SUM(o.customerStatus) as closeRequests,
            COUNT(o.orderNumber) as occupiedBy,
            MIN(o.createdAt) as createdAt
            FROM restaurantsQrs rq
            LEFT JOIN orders o ON
            (o.tableId = rq.value AND o.restaurantId = '${restaurantId}' AND o.status = 1 AND o.type = 'Dine-In')
            WHERE rq.restaurantId = '${restaurantId}' AND rq.active = 1
            GROUP BY rq.value
            ORDER BY rq.id ASC`,
            null,
            (data) => {
                if (data.length) {
                    return res.send(data)
                } else {
                    return res.status(422).send({ 'msg': `No Table Data!` })
                }
            }
        )
    })

    app.post('/admin/mergeTables', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        const { selectedTables, mergeId } = req.body
        if (!selectedTables || !Array.isArray(selectedTables)) return res.status(401).send({ 'msg': 'Table(s) list required!' })
        if (!selectedTables.length) return res.status(401).send({ 'msg': 'No Table(s) Selected!' })
        if (selectedTables.length < 2) return res.status(422).send({ 'msg': 'Select atleast 2 tables!' })
        if (selectedTables.length > 3) return res.status(422).send({ 'msg': 'Maximum 3 tables could be merged!' })
        if (!mergeId) return res.status(422).send({ 'msg': 'Merge ID is required!' })
        getSecureConnection(
            res,
            adminId,
            `UPDATE restaurantsQrs SET ? WHERE id IN (${selectedTables.join()})`,
            { mergeId },
            (result) => {
                if (result.changedRows)
                    return res.send({ 'msg': 'Tables Merged Successfully!' })
                else return res.status(422).send({ 'msg': 'Tables Merging Failed' })
            }
        )
    })

    app.post('/admin/unMergeTables', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { mergeId } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!mergeId) return res.status(422).send({ 'msg': 'Merge ID is required!' })
        getSecureConnection(
            res,
            adminId,
            `UPDATE restaurantsQrs SET ? WHERE mergeId = '${mergeId}'`,
            { mergeId: null },
            (result) => {
                if (result.changedRows)
                    return res.send({ 'msg': 'Tables Un-merged Successfully!' })
                else return res.status(422).send({ 'msg': 'Tables Merging Failed' })
            }
        )
    })

    app.post('/admin/getServicesQue', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT GROUP_CONCAT(sq.id) as ids, sq.tableNumber, sq.orderNumber, GROUP_CONCAT(sq.text) as text,
            TIMESTAMPDIFF(SECOND, MIN(sq.createdAt), CURRENT_TIMESTAMP) as time
            FROM servicesQue sq
            LEFT JOIN orders o ON o.orderNumber = sq.orderNumber AND sq.status = 1 
            WHERE sq.restaurantId = '${restaurantId}' AND o.status = 1
            GROUP BY sq.orderNumber
            ORDER BY sq.createdAt ASC`,
            null,
            (data) => {
                if (data.length) {
                    return res.send(data)
                } else {
                    return res.status(422).send({ 'msg': 'No services in que!' })
                }
            }
        )
    })

    app.post('/admin/getTableOrders', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId, tableId } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        if (!tableId) return res.status(422).send({ 'msg': 'Table Id is required!' })
        getTransactionalConnection()
            .getConnection(function (error, tempDb) {
                if (!!error) {
                    console.log('DbConnectionError', error.sqlMessage)
                    return res.status(503).send({ 'msg': 'Unable to reach database!' })
                }
                tempDb.query(`SELECT * FROM users WHERE id = '${adminId}' AND (role = 'Admin' || role = 'SuperAdmin' || role = 'Staff') AND active = 1`, (error, authResult) => {
                    if (!!error) return res.status(422).send({ 'msg': error.sqlMessage })
                    if (authResult.length) {
                        tempDb.beginTransaction(function (error) {
                            if (!!error) {
                                console.log('TransactionError', error.sqlMessage)
                                return res.status(422).send({ 'msg': error.sqlMessage })
                            }
                            tempDb.query('SET SESSION group_concat_max_len = 1000000', null, function (error) {
                                if (!!error) {
                                    console.log('TableError', error.sqlMessage)
                                    tempDb.rollback(function () {
                                        return res.status(422).send({ 'msg': "Failed to assign tables to staff!" })
                                    })
                                } else {
                                    tempDb.query(`SELECT o.orderNumber, o.customerStatus,
                                        CONCAT('[',
                                            GROUP_CONCAT(
                                                CONCAT(
                                                    '{"id":',oi.id,
                                                    ',"name":"',oi.name,
                                                    '","quantity":',oi.quantity,
                                                    ',"totalPrice":',oi.totalPrice,
                                                    ',"status":"',oi.status,'"}'
                                                ) ORDER BY oi.createdAt DESC
                                            ),
                                        ']') as items
                                        FROM orders o
                                        LEFT JOIN orderItems oi ON o.orderNumber = oi.orderNumber AND oi.restaurantId = '${restaurantId}' AND o.tableId = '${tableId}'
                                        WHERE o.restaurantId = '${restaurantId}' AND o.tableId = '${tableId}' AND o.status = 1 AND o.type = 'Dine-In'
                                        GROUP BY o.orderNumber
                                        ORDER BY o.createdAt DESC`, null, function (error, result) {
                                        if (!!error) {
                                            console.log('TableError', error.sqlMessage)
                                            tempDb.rollback(function () {
                                                return res.status(422).send({ 'msg': "Failed to assign tables to staff!" })
                                            })
                                        } else {
                                            if (result.length) {
                                                return res.send(result)
                                            } else {
                                                return res.status(422).send({ 'msg': `No Table Data Available!` })
                                            }
                                        }
                                    })
                                }
                            })
                        })
                    }
                    else return res.status(401).send({ 'msg': 'Invalid Session!' })
                })
            }
        )
    })

    app.post('/admin/getOrderItemDetails', async (req, res) => {
        const { id } = req.body
        if (!id) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        getConnection(
            res,
            `SELECT oi.name, oi.quantity, oi.status, oi.price, oi.totalPrice, oi.specialInstructions,
            CONCAT('[',
                GROUP_CONCAT(
                    CONCAT(
                        '{"id":',oia.id,
                        ',"name":"',oia.addOnName,
                        '","option":"',oia.addOnOption,
                        '","price":',oia.price,'}'
                    ) ORDER BY oi.createdAt DESC
                ),
            ']') as addOns
            FROM orderItems oi
            LEFT JOIN orderItemAddOns oia ON oi.id = oia.orderItemId
            WHERE oi.id = ${id}
            GROUP BY oi.id`,
            null,
            (result) => {
                if (result.length) return res.send(result[0])
                else return res.status(422).send({ 'msg': 'No item details available!' })
            }
        )
    })

    app.post('/admin/closeOrder', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId, orderNumber } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        if (!orderNumber) return res.status(422).send({ 'msg': 'Check number is required!' })
        getSecureConnection(
            res,
            adminId,
            `UPDATE orders SET ? WHERE restaurantId = '${restaurantId}' && orderNumber = '${orderNumber}'`,
            { status: false },
            (result) => {
                if (result.changedRows) return res.send({ 'msg': 'Order closed successfully!' })
                else return res.status(422).send({ 'msg': 'Order closed already!' })
            }
        )
    })

    app.post('/admin/getOrders', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId, type, status } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        if (!type) return res.status(422).send({ 'msg': 'Order type is required!' })
        if (!status && status !== 0) return res.status(422).send({ 'msg': 'Order Status is required!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT *, 
            CONVERT(orderNumber, CHAR) as orderNumber
            FROM orders WHERE
            restaurantId = '${restaurantId}'
            AND status = ${status}
            AND type = '${type}'
            ORDER BY createdAt DESC `,
            null,
            (data) => {
                if (data.length) {
                    return res.send(data)
                } else {
                    return res.status(422).send({ 'msg': `No ${status ? 'Open' : 'Closed'}, ${type} Orders!` })
                }
            }
        )
    })

    app.post('/admin/getStaffAssignedTables', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT sat.staffId as id, u.name,
            GROUP_CONCAT(sat.tableNumber) as assignedTables
            FROM staffAssignedTables sat
            JOIN users u on u.id = sat.staffId
            WHERE sat.restaurantId = '${restaurantId}'
            GROUP BY sat.staffId
            ORDER BY sat.createdAt DESC`,
            null,
            (data) => {
                if (data.length) {
                    return res.send(data)
                } else {
                    return res.status(422).send({ 'msg': `No table(s) assigned to staff!` })
                }
            }
        )
    })

    app.post('/admin/assignTablesToStaff', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { selectedStaff, assignedTables, restaurantId } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!selectedStaff) return res.status(422).send({ 'msg': 'Staff ID is required!' })
        if (!assignedTables) return res.status(422).send({ 'msg': 'No data to update!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant ID is required!' })
        getTransactionalConnection()
            .getConnection(function (error, tempDb) {
                if (!!error) {
                    console.log('DbConnectionError', error.sqlMessage)
                    return res.status(503).send({ 'msg': 'Unable to reach database!' })
                }
                tempDb.query(`SELECT * FROM users WHERE id = '${adminId}' AND (role = 'Admin' || role = 'SuperAdmin' || role = 'Staff') AND active = 1`, (error, authResult) => {
                    if (!!error) return res.status(422).send({ 'msg': error.sqlMessage })
                    if (authResult.length) {
                        tempDb.beginTransaction(function (error) {
                            if (!!error) {
                                console.log('TransactionError', error.sqlMessage)
                                return res.status(422).send({ 'msg': error.sqlMessage })
                            }
                            tempDb.query(`DELETE FROM staffAssignedTables WHERE staffId = ${selectedStaff}`, null, function (error) {
                                if (!!error) {
                                    console.log('TableError', error.sqlMessage)
                                    tempDb.rollback(function () {
                                        return res.status(422).send({ 'msg': "Failed to assign tables to staff!" })
                                    })
                                } else {
                                    if (assignedTables && assignedTables.length) {
                                        var query = 'INSERT INTO staffAssignedTables ( staffId, tableNumber, restaurantId ) VALUES'
                                        for (var i = 0; i < assignedTables.length; i++) {
                                            query = query + ` ( ${selectedStaff}, '${assignedTables[i]}', '${restaurantId}' )`
                                            if (i !== (assignedTables.length - 1))
                                                query = query + ','
                                        }
                                        tempDb.query(query, function (error) {
                                            if (!!error) {
                                                console.log('TableError', error.sqlMessage)
                                                tempDb.rollback(function () {
                                                    return res.status(422).send({ 'msg': "Failed to assign tables to staff" })
                                                })
                                            } else {
                                                tempDb.commit(function (error) {
                                                    if (error) {
                                                        tempDb.rollback(function () {
                                                            return res.status(422).send({ 'msg': error.sqlMessage })
                                                        })
                                                    }
                                                    tempDb.release()
                                                    return res.send({
                                                        'msg': 'Updated staff tables successfully!'
                                                    })
                                                })
                                            }
                                        })
                                    } else {
                                        tempDb.commit(function (error) {
                                            if (error) {
                                                tempDb.rollback(function () {
                                                    return res.status(422).send({ 'msg': error.sqlMessage })
                                                })
                                            }
                                            tempDb.release()
                                            return res.send({
                                                'msg': 'Updated staff tables successfully!'
                                            })
                                        })
                                    }
                                }
                            })
                        })
                    }
                    else return res.status(401).send({ 'msg': 'Invalid Session!' })
                })
            })
    })

    app.post('/admin/getStaffDashboard', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT rq.id, rq.tableName, rq.value, rq.mergeId,
            SUM(o.doNotDisturb) as doNotDisturb,
            SUM(o.customerStatus) as closeRequests,
            GROUP_CONCAT(o.orderNumber) as occupiedBy
            FROM restaurantsQrs rq
            LEFT JOIN orders o ON
            (o.tableId = rq.value AND o.restaurantId = '${restaurantId}' AND o.status = 1 AND o.type = 'Dine-In')
            WHERE rq.restaurantId = '${restaurantId}' AND rq.active = 1
            AND rq.value in (SELECT tableNumber FROM staffAssignedTables WHERE staffId = ${adminId})
            GROUP BY rq.value
            ORDER BY rq.id ASC`,
            null,
            (data) => {
                if (data.length) {
                    return res.send(data)
                } else {
                    return res.status(422).send({ 'msg': `No Table Data!` })
                }
            }
        )
    })

    app.post('/admin/getKitchenDashboard', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT TIMESTAMPDIFF(SECOND, oi.createdAt, CURRENT_TIMESTAMP) as time,
            o.type, o.orderNumber, o.tableId,
            oi.id, oi.quantity, oi.name, oi.specialInstructions, oi.status,
            CONCAT('[',
                GROUP_CONCAT(
                    CONCAT(
                        '{"name":"',oia.addOnName,
                        '","option":"',oia.addOnOption,'"}'
                    ) ORDER BY oi.createdAt DESC
                ),
            ']') as addOns
            FROM orders o
            JOIN orderItems oi ON o.orderNumber = oi.orderNumber AND oi.restaurantId = '${restaurantId}'
            LEFT JOIN orderItemAddOns oia ON oi.id = oia.orderItemId
            WHERE o.restaurantId = '${restaurantId}' AND o.status = 1 AND o.ready = 0
            GROUP BY oi.id
            ORDER BY o.createdAt DESC, oi.createdAt DESC`,
            null,
            (result) => {
                if (result.length) {
                    return res.send(getGroupedList(result, 'orderNumber'))
                } else {
                    return res.status(422).send({ 'msg': `No items in-que!` })
                }
            }
        )
    })

    app.post('/admin/markItemReady', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { id } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!id) return res.status(422).send({ 'msg': 'Item ID is required!' })
        getSecureConnection(
            res,
            adminId,
            `UPDATE orderItems SET ? WHERE id = ${id}`,
            { status: 'R' },
            (result) => {
                if (result.changedRows) return res.send({ 'msg': 'Item marked ready successfully!' })
                else return res.status(422).send({ 'msg': 'Failed to mark item as ready!' })
            }
        )
    })

    app.post('/admin/markOrderReady', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId, orderNumber } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant ID is required!' })
        if (!orderNumber) return res.status(422).send({ 'msg': 'OrderNumber is required!' })
        getSecureConnection(
            res,
            adminId,
            `SET SQL_SAFE_UPDATES=0`,
            null,
            (result) => {
                getSecureConnection(
                    res,
                    adminId,
                    `UPDATE orderItems SET status = 'R' WHERE orderNumber = '${orderNumber}' AND restaurantId = '${restaurantId}' AND status = 'P'`,
                    null,
                    () => {
                        getSecureConnection(
                            res,
                            adminId,
                            `UPDATE orders SET ready = 1 WHERE orderNumber = '${orderNumber}' AND restaurantId = '${restaurantId}' AND status = 1`,
                            null,
                            (result) => {
                                if (result.changedRows) return res.send({ 'msg': 'Order marked ready successfully!' })
                                else return res.status(422).send({ 'msg': 'Failed to mark item as ready!' })
                            }
                        )
                    }
                )
            }
        )
    })

    app.post('/admin/addCategory', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId, name } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        if (!name) return res.status(422).send({ 'msg': 'Category Name is required!' })
        getSecureConnection(
            res,
            adminId,
            `INSERT INTO categories SET ?`,
            { restaurantId, name },
            (result) => {
                if (result.affectedRows)
                    return res.send({ 'msg': 'Category Added Successfully!' })
                else
                    return res.status(422).send({ 'msg': 'Failed to add category!' })
            }
        )
    })

    app.post('/admin/getCategories', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT id, name FROM categories WHERE restaurantId = '${restaurantId}'`,
            null,
            (data) => {
                if (data.length) {
                    return res.send(data)
                } else {
                    return res.status(422).send({ 'msg': 'No categories available!' })
                }
            }
        )
    })

    app.post('/admin/updateCategory', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { id, name } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!id) return res.status(422).send({ 'msg': 'Category Id is required!' })
        if (!name) return res.status(422).send({ 'msg': 'Category name is required!' })
        getSecureConnection(
            res,
            adminId,
            `UPDATE categories SET ? WHERE id = ${id}`,
            { name },
            (result) => {
                if (result.changedRows)
                    return res.send({ 'msg': 'Category Name Updated Successfully!' })
                else return res.status(422).send({ 'msg': 'Category already exists' })
            }
        )
    })

    app.post('/admin/deleteCategory', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { id, name } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!id) return res.status(422).send({ 'msg': 'Category Id is required!' })
        getSecureConnection(
            res,
            adminId,
            `DELETE FROM categories WHERE id = ${id}`,
            { name },
            (result) => {
                if (result.affectedRows)
                    return res.send({ 'msg': 'Category Deleted Successfully!' })
                else return res.status(422).send({ 'msg': 'Invalid category ID' })
            }
        )
    })

    app.post('/admin/addMenuItem', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId, imageUrl, name, shortDescription, price, categoryId, addOns } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant ID is required!' })
        if (!imageUrl) return res.status(422).send({ 'msg': 'Item imaage is required!' })
        if (!name) return res.status(422).send({ 'msg': 'Item name is required!' })
        if (!price) return res.status(422).send({ 'msg': 'Item price is required!' })
        if (!categoryId) return res.status(422).send({ 'msg': 'Item category is required!' })
        if (addOns && addOns.length) {
            for (var i = 0; i < addOns.length; i++) {
                if (!addOns[i].name) return res.status(422).send({ 'msg': 'AddOns name is required!' })
            }
        }
        getTransactionalConnection()
            .getConnection(function (error, tempDb) {
                if (!!error) {
                    console.log('DbConnectionError', error.sqlMessage)
                    return res.status(503).send({ 'msg': 'Unable to reach database!' })
                }

                tempDb.query(`SELECT * FROM users WHERE id = '${adminId}' AND (role = 'Admin' || role = 'SuperAdmin') AND active = 1`, (error, authResult) => {
                    if (!!error) return res.status(422).send({ 'msg': error.sqlMessage })
                    if (authResult.length) {
                        tempDb.beginTransaction(function (error) {
                            if (!!error) {
                                console.log('TransactionError', error.sqlMessage)
                                return res.status(422).send({ 'msg': error.sqlMessage })
                            }
                            const menu = {}
                            menu.restaurantId = restaurantId
                            menu.name = name
                            menu.price = price
                            menu.categoryId = categoryId
                            menu.imageUrl = imageUrl
                            if (shortDescription)
                                menu.shortDescription = shortDescription
                            tempDb.query('INSERT INTO menu SET ?', menu, function (error, result) {
                                if (!!error) {
                                    console.log('TableError', error.sqlMessage)
                                    tempDb.rollback(function () {
                                        return res.status(422).send({
                                            'msg': error.sqlMessage.includes('Duplicate') ?
                                                "Duplicate entry" : error.sqlMessage.includes('foreign key') ?
                                                    "Invalid Category" : "Failed to add Menu Item"
                                        })
                                    })
                                } else {
                                    if (addOns && addOns.length) {
                                        for (let i = 0; i < addOns.length; i++) {
                                            const addOn = {}
                                            addOn.name = addOns[i].name
                                            addOn.menuId = result.insertId
                                            if (addOns[i].price)
                                                addOn.price = addOns[i].price
                                            if (addOns[i].mandatory)
                                                addOn.mandatory = addOns[i].mandatory
                                            tempDb.query('INSERT INTO addOns SET ?', addOn, function (error, result) {
                                                if (!!error) {
                                                    console.log('TableError', error.sqlMessage)
                                                    tempDb.rollback(function () {
                                                        return res.status(422).send({ 'msg': "Failed to add Add-on" })
                                                    })
                                                } else {
                                                    if (addOns[i].variations && addOns[i].variations.length) {
                                                        tempDb.query("SET FOREIGN_KEY_CHECKS=0;")
                                                        let query = 'INSERT INTO addOnOptions ( name, price, addOnID ) VALUES'
                                                        for (var j = 0; j < addOns[i].variations.length; j++) {
                                                            query = query + ` ( '${addOns[i].variations[j].name}', '${addOns[i].variations[j].price}', '${result.insertId}' )`
                                                            if (j !== (addOns[i].variations.length - 1))
                                                                query = query + ','
                                                        }
                                                        tempDb.query(query, function (error) {
                                                            if (!!error) {
                                                                console.log('TableError', error.sqlMessage)
                                                                tempDb.rollback(function () {
                                                                    return res.status(422).send({ 'msg': "Failed to add Add-on Options" })
                                                                })
                                                            }
                                                        })
                                                    }
                                                }
                                            })
                                        }
                                    }
                                    tempDb.commit(function (error) {
                                        if (error) {
                                            tempDb.rollback(function () {
                                                return res.status(422).send({ 'msg': error.sqlMessage })
                                            })
                                        }
                                        tempDb.query("SET FOREIGN_KEY_CHECKS=1;")
                                        tempDb.release()
                                        return res.send({
                                            'msg': 'Menu Item Added Successfully!'
                                        })
                                    })
                                }
                            })
                        })
                    }
                    else return res.status(401).send({ 'msg': 'Invalid Session!' })
                })
            })
    })

    app.post('/admin/getMenuItems', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId, name } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT m.id, m.imageUrl, m.name, m.shortDescription, m.price, m.categoryId, 
            ao.id as addOn_id, ao.name as addOn_name, ao.price as addOn_price, ao.mandatory, 
            aoo.id addOnOption_id, aoo.name addOnOption_name, aoo.price as addOnOption_price
            FROM menu m 
            LEFT JOIN addOns ao ON ao.menuId = m.id
            LEFT JOIN addOnOptions aoo ON aoo.addOnID = ao.id
            WHERE restaurantId = '${restaurantId}'`,
            { restaurantId, name },
            (data) => {
                if (data.length) {
                    let menu = []
                    for (let i = 0; i < data.length; i++) {
                        let addOns = []
                        for (let j = 0; j < data.length; j++) {
                            let addOnOptions = []
                            for (let k = 0; k < data.length; k++) {
                                if (data[k].addOnOption_id && !includes(addOnOptions, data[k].addOnOption_id) && data[k].addOn_id === data[j].addOn_id) {
                                    addOnOptions.push({
                                        id: data[k].addOnOption_id,
                                        name: data[k].addOnOption_name,
                                        price: data[k].addOnOption_price
                                    })
                                }
                            }
                            if (data[j].addOn_id && !includes(addOns, data[j].addOn_id) && data[j].id === data[i].id) {
                                addOns.push({
                                    id: data[j].addOn_id,
                                    name: data[j].addOn_name,
                                    price: data[j].addOn_price,
                                    mandatory: data[j].mandatory,
                                    addOnOptions
                                })
                            }
                        }
                        const result = !includes(menu, data[i].id)
                        if (result) {
                            menu.push({
                                id: data[i].id,
                                imageUrl: data[i].imageUrl,
                                name: data[i].name,
                                shortDescription: data[i].shortDescription,
                                price: data[i].price,
                                categoryId: data[i].categoryId,
                                addOns
                            })
                        }
                    }
                    return res.send(menu)
                }
                else return res.status(422).send({ 'msg': 'No menu items available!' })
            }
        )
    })

    app.post('/admin/updateMenuItem', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { id, updatedData } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!id) return res.status(422).send({ 'msg': 'Item Id is required!' })
        if (!updatedData) return res.status(422).send({ 'msg': 'No data to update!' })
        getSecureConnection(
            res,
            adminId,
            `UPDATE menu SET ? WHERE id = ${id}`,
            updatedData,
            (result) => {
                if (result.changedRows)
                    return res.send({ 'msg': 'Item details Updated Successfully!' })
                else return res.status(422).send({ 'msg': 'Failed to update item details' })
            }
        )
    })

    app.post('/admin/addAddOn', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { addOn } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!addOn) return res.status(422).send({ 'msg': 'No data to update!' })
        if (addOn) {
            if (!addOn.name) return res.status(422).send({ 'msg': 'Add-on name is required!' })
            if (!addOn.menuId) return res.status(422).send({ 'msg': 'Menu Id is required!' })
            if (addOn.addOnOptions && addOn.addOnOptions.length) {
                for (var i = 0; i < addOn.addOnOptions.length; i++) {
                    if (!addOn.addOnOptions[i].name) return res.status(422).send({ 'msg': `Option # ${i + 1} name is required!` })
                }
            }
        }
        getTransactionalConnection()
            .getConnection(function (error, tempDb) {
                if (!!error) {
                    console.log('DbConnectionError', error.sqlMessage)
                    return res.status(503).send({ 'msg': 'Unable to reach database!' })
                }
                tempDb.query(`SELECT * FROM users WHERE id = '${adminId}' AND (role = 'Admin' || role = 'SuperAdmin') AND active = 1`, (error, authResult) => {
                    if (!!error) return res.status(422).send({ 'msg': error.sqlMessage })
                    if (authResult.length) {
                        tempDb.beginTransaction(function (error) {
                            if (!!error) {
                                console.log('TransactionError', error.sqlMessage)
                                return res.status(422).send({ 'msg': error.sqlMessage })
                            }
                            const data = { ...addOn }
                            delete data['addOnOptions']
                            tempDb.query(`INSERT INTO addOns SET ?`, data, function (error, result) {
                                if (!!error) {
                                    console.log('TableError', error.sqlMessage)
                                    tempDb.rollback(function () {
                                        return res.status(422).send({ 'msg': "Failed to add Add-on!" })
                                    })
                                } else {
                                    if (addOn.addOnOptions && addOn.addOnOptions.length) {
                                        tempDb.query("SET FOREIGN_KEY_CHECKS=0;")
                                        let query = 'INSERT INTO addOnOptions ( name, price, addOnID ) VALUES'
                                        for (var j = 0; j < addOn.addOnOptions.length; j++) {
                                            query = query + ` ( '${addOn.addOnOptions[j].name}', '${addOn.addOnOptions[j].price}', '${result.insertId}' )`
                                            if (j !== (addOn.addOnOptions.length - 1))
                                                query = query + ','
                                        }
                                        tempDb.query(query, function (error) {
                                            if (!!error) {
                                                console.log('TableError', error.sqlMessage)
                                                tempDb.rollback(function () {
                                                    return res.status(422).send({ 'msg': "Failed to add Add-on Options" })
                                                })
                                            }
                                        })
                                    }
                                    tempDb.commit(function (error) {
                                        if (error) {
                                            tempDb.rollback(function () {
                                                return res.status(422).send({ 'msg': error.sqlMessage })
                                            })
                                        }
                                        tempDb.query("SET FOREIGN_KEY_CHECKS=1;")
                                        tempDb.release()
                                        return res.send({
                                            'msg': 'Add-on Updated Successfully!'
                                        })
                                    })
                                }
                            })
                        })
                    }
                    else return res.status(401).send({ 'msg': 'Invalid Session!' })
                })
            })
    })

    app.post('/admin/updateAddOn', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { id, updatedAddOn } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!id) return res.status(422).send({ 'msg': 'Item Id is required!' })
        if (!updatedAddOn) return res.status(422).send({ 'msg': 'No data to update!' })
        if (updatedAddOn) {
            if (!updatedAddOn.name) return res.status(422).send({ 'msg': 'Add-on name is required!' })
            if (updatedAddOn.addOnOptions && updatedAddOn.addOnOptions.length) {
                for (var i = 0; i < updatedAddOn.addOnOptions.length; i++) {
                    if (!updatedAddOn.addOnOptions[i].name) return res.status(422).send({ 'msg': `Option # ${i + 1} name is required!` })
                }
            }
        }
        getTransactionalConnection()
            .getConnection(function (error, tempDb) {
                if (!!error) {
                    console.log('DbConnectionError', error.sqlMessage)
                    return res.status(503).send({ 'msg': 'Unable to reach database!' })
                }
                tempDb.query(`SELECT * FROM users WHERE id = '${adminId}' AND (role = 'Admin' || role = 'SuperAdmin') AND active = 1`, (error, authResult) => {
                    if (!!error) return res.status(422).send({ 'msg': error.sqlMessage })
                    if (authResult.length) {
                        tempDb.beginTransaction(function (error) {
                            if (!!error) {
                                console.log('TransactionError', error.sqlMessage)
                                return res.status(422).send({ 'msg': error.sqlMessage })
                            }
                            const data = { ...updatedAddOn }
                            delete data['addOnOptions']
                            tempDb.query(`UPDATE addOns SET ? WHERE id = ${id}`, data, function (error, result) {
                                if (!!error) {
                                    console.log('TableError', error.sqlMessage)
                                    tempDb.rollback(function () {
                                        return res.status(422).send({ 'msg': "Failed to update Add-on!" })
                                    })
                                } else {
                                    tempDb.query(`DELETE FROM addOnOptions WHERE addOnID = ${id}`, null, function (error, result) {
                                        if (!!error) {
                                            console.log('TableError', error.sqlMessage)
                                            tempDb.rollback(function () {
                                                return res.status(422).send({ 'msg': "Failed to update Add-on option!" })
                                            })
                                        } else {
                                            if (updatedAddOn.addOnOptions && updatedAddOn.addOnOptions.length) {
                                                tempDb.query("SET FOREIGN_KEY_CHECKS=0;")
                                                let query = 'INSERT INTO addOnOptions ( name, price, addOnID ) VALUES'
                                                for (var j = 0; j < updatedAddOn.addOnOptions.length; j++) {
                                                    query = query + ` ( '${updatedAddOn.addOnOptions[j].name}', '${updatedAddOn.addOnOptions[j].price}', '${id}' )`
                                                    if (j !== (updatedAddOn.addOnOptions.length - 1))
                                                        query = query + ','
                                                }
                                                tempDb.query(query, function (error) {
                                                    if (!!error) {
                                                        console.log('TableError', error.sqlMessage)
                                                        tempDb.rollback(function () {
                                                            return res.status(422).send({ 'msg': "Failed to add Add-on Options" })
                                                        })
                                                    }
                                                })
                                            }
                                        }
                                    })
                                    tempDb.commit(function (error) {
                                        if (error) {
                                            tempDb.rollback(function () {
                                                return res.status(422).send({ 'msg': error.sqlMessage })
                                            })
                                        }
                                        tempDb.query("SET FOREIGN_KEY_CHECKS=1;")
                                        tempDb.release()
                                        return res.send({
                                            'msg': 'Add-on Updated Successfully!'
                                        })
                                    })
                                }
                            })
                        })
                    }
                    else return res.status(401).send({ 'msg': 'Invalid Session!' })
                })
            })
    })

    app.post('/admin/getRestaurantUsers', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT u.id, u.name, u.email, u.contactNumber, u.role, u.active,
            r.primaryContactId, r.secondaryContactId
            FROM users u
            JOIN restaurants r ON u.restaurantId = r.restaurantId
            WHERE u.restaurantId = '${restaurantId}'
            ORDER BY u.createdAt DESC `,
            null,
            (data) => {
                if (data.length) {
                    return res.send(data)
                } else {
                    return res.status(422).send({ 'msg': 'No users available!' })
                }
            }
        )
    })

    app.post('/admin/addUser', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId, name, email, role, contactNumber } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant Id is required!' })
        if (!name) return res.status(422).send({ 'msg': 'User\'s name is required!' })
        if (!email) return res.status(422).send({ 'msg': 'User\'s email is required!' })
        if (!role) return res.status(422).send({ 'msg': 'User\'s role is required!' })
        getTransactionalConnection()
            .getConnection(function (error, tempDb) {
                if (!!error) {
                    console.log('DbConnectionError', error.sqlMessage)
                    return res.status(503).send({ 'msg': 'Unable to reach database!' })
                } else {
                    tempDb.query(`SELECT * FROM users WHERE id = '${adminId}' AND (role = 'SuperAdmin' OR role = 'Admin') AND active = 1`, (error, authResult) => {
                        if (!!error) return res.status(422).send({ 'msg': error.sqlMessage })
                        if (authResult.length) {
                            tempDb.beginTransaction(function (error) {
                                if (!!error) {
                                    console.log('TransactionError', error.sqlMessage)
                                    return res.status(422).send({ 'msg': error.sqlMessage })
                                }
                                const hashString = Math.random().toString(36).substring(2);
                                tempDb.query('INSERT INTO users SET ?', {
                                    restaurantId, name, email, role, contactNumber, hashString
                                }, async function (error) {
                                    if (!!error) {
                                        console.log('TableError', error.sqlMessage)
                                        tempDb.rollback(function () {
                                            return res.status(422).send({ 'msg': error.sqlMessage })
                                        })
                                    } else {
                                        const emailStatus = await sendEmail(
                                            email,
                                            'Create Password',
                                            setPasswordMessage(
                                                name,
                                                restaurantId,
                                                `${URL}/client/createPassword/${restaurantId}/${email}/${hashString}`
                                            )
                                        )
                                        if (emailStatus && emailStatus.accepted.length) {
                                            tempDb.commit(function (error) {
                                                if (error) {
                                                    tempDb.rollback(function () {
                                                        return res.status(422).send({ 'msg': error.sqlMessage })
                                                    })
                                                }
                                                tempDb.release()
                                                return res.send({
                                                    'msg': 'User Added Successfully!'
                                                })
                                            })
                                        } else tempDb.rollback(function () {
                                            return res.status(422).send({ 'msg': `Invalid Email: "${email}"!` })
                                        })
                                    }
                                })
                            })
                        }
                        else return res.status(401).send({ 'msg': 'Invalid Session!' })
                    })
                }
            })
    })

    app.post('/admin/updateUser', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { id, userUpdatedData } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!id) return res.status(422).send({ 'msg': 'User\'s Id is required!' })
        if (!userUpdatedData) return res.status(422).send({ 'msg': 'No data to update!' })
        if (userUpdatedData.id) return res.status(422).send({ 'msg': 'Can\'t update user\'s ID!' })
        if (userUpdatedData.hashString) return res.status(422).send({ 'msg': 'Can\'t update user\'s hashString!' })
        if (userUpdatedData.passwordForgotten) return res.status(422).send({ 'msg': 'Key passwordForgotten can\'t be update!' })
        if (userUpdatedData.restaurantId) return res.status(422).send({ 'msg': 'Can\'t update user\'s restaurantId!' })
        getSecureConnection(
            res,
            adminId,
            `UPDATE users SET ? WHERE id = ${id}`,
            userUpdatedData,
            (result) => {
                if (result.changedRows)
                    return res.send({ 'msg': 'User Updated Successfully!' })
                else return res.status(422).send({ 'msg': 'Failed to update user' })
            }
        )
    })

    app.post('/admin/deleteUser', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { id } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!id) return res.status(422).send({ 'msg': 'User Id is required!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT primaryContactId, secondaryContactId from restaurants WHERE primaryContactId = ${id} OR secondaryContactId = ${id}`,
            null,
            (result) => {
                if (result.length) {
                    if (result[0].primaryContactId === id)
                        return res.status(422).send({ 'msg': 'Can\'t delete restaurant\'s Primary user!' })
                    else
                        return res.status(422).send({ 'msg': 'Can\'t delete restaurant\'s Secondary user!' })
                }
                else {
                    getConnection(
                        res,
                        `DELETE FROM users WHERE id = ${id}`,
                        null,
                        (result) => {
                            if (result.affectedRows)
                                return res.send({ 'msg': 'User Deleted Successfully!' })
                            else return res.status(422).send({ 'msg': 'Failed to delete user' })
                        }
                    )
                }
            }
        )
    })

    app.post('/admin/uploadToS3', uploader, async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { file } = req
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!file) return res.status(422).send({ 'msg': 'File is required!' })

        const name = file.originalname.split('.')
        const fileType = name[name.length - 1]
        const fileName = `${uuid()}.${fileType}`

        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileName,
            Body: file.buffer
        }

        s3.upload(params, (error, data) => {
            if (error)
                return res.status(422).send({ 'msg': error.message })
            else res.send({ imageUrl: data.Location, msg: 'File uploaded successfully!' })
        })
    })

    app.post('/admin/deleteFromS3', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { fileName } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!fileName) return res.status(422).send({ 'msg': 'File name is required!' })

        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileName,
        }

        s3.deleteObject(params, (error) => {
            if (error)
                return res.status(422).send({ 'msg': error.message })
            else res.send({ msg: 'Deleted successfully!' })
        })
    })
}

function decrypt(token) {
    const decryptedToken = token
    return decryptedToken
}

function lowerCased(string) {
    return string.toLowerCase()
}

function includes(list, id) {
    var result = list.filter(item => item.id === id)
    return result.length
}

function getGroupedList(list, key) {
    let groupedList = []
    if (list && list.length) {
        groupedList = list.reduce((r, a) => {
            r[a[key]] = r[a[key]] || [];
            r[a[key]].push(a);
            return r;
        }, Object.create(null));
    }
    const array = []
    if (groupedList)
        for (const [key, value] of Object.entries(groupedList))
            array.push({ id: key, data: value })
    return array
}

function setPasswordMessage(name, restaurantName, link) {
    return `Hi ${name},\nWelcome to DineMate!\n\nYour Restaurant "${restaurantName}" has been registered to our system.\n\nVisit the following link to create your login password:\n${link}`
}

function forgotPasswordMessage(link) {
    return `Welcome Back!\n\nVisit the following link to reset your login password:\n${link}`
}
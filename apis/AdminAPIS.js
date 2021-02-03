const { getSecureConnection, getConnection, getTransactionalConnection } = require('../services/mySql')

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
        let sql = 'SELECT U.id, U.name, U.email, U.role, U.restaurantId'
        if (lowerCased(email) !== 'ahads62426@gmail.com')
            sql += ', R.restaurantName'
        sql += ' FROM users U'
        if (lowerCased(email) !== 'ahads62426@gmail.com')
            sql += ' JOIN restaurants R on U.restaurantId = R.restaurantId'
        sql += ` WHERE U.email = '${lowerCased(email)}' AND U.password = BINARY '${password}' AND active = 1`
        getConnection(
            res,
            sql,
            null,
            (data) => {
                if (data.length)
                    return res.send(data[0])
                else
                    return res.status(422).send({ 'msg': `Invalid credentials provided! Or, User is in-active` })
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
                if (result.changedRows)
                    return res.send({ 'msg': 'Password Reset Link Sent!' })
                else return res.status(422).send({ 'msg': 'Forgot Password request failed!' })
            }
        )
    })

    app.post('/admin/createPassword', async (req, res) => {
        const { restaurantId, email, password, hashString } = req.body
        if (!restaurantId) return res.status(422).send({ 'msg': 'Restaurant ID is required!' })
        if (!email) return res.status(422).send({ 'msg': 'Email is required!' })
        if (!password) return res.status(422).send({ 'msg': 'Password is required!' })
        if (!hashString) return res.status(422).send({ 'msg': 'Invalid hashString!' })
        getConnection(
            res,
            `UPDATE users SET ? WHERE email = '${lowerCased(email)}' 
            AND restaurantId = BINARY '${restaurantId}' 
            AND passwordForgotten = 1 
            AND hashString = '${hashString}'`,
            { password, passwordForgotten: 0 },
            (result) => {
                if (result.changedRows)
                    return res.send({ 'msg': 'Password Updated Successfully!' })
                else return res.status(422).send({ 'msg': 'Link Expired!' })
            }
        )
    })

    app.post('/admin/addRestuarant', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        const { restaurantId, imageUrl, restaurantName, cuisine, address, primaryContact, secondaryContact  } = req.body
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        if (!restaurantId) return res.status(422).send({ 'msg': 'Slug is required!' })
        if (!restaurantName) return res.status(422).send({ 'msg': 'Restaurant Name is required!' })
        if (!address) return res.status(422).send({ 'msg': 'Address fields are required!' })
        if (!address.address) return res.status(422).send({ 'msg': 'Address is required!' })
        if (!address.city) return res.status(422).send({ 'msg': 'City is required!' })
        if (!address.country) return res.status(422).send({ 'msg': 'Country is required!' })
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
                        restaurant.city = address.city
                        
                        let data = address
                        data.restaurantId = restaurantId
                        tempDb.query('INSERT INTO restaurantsAddress SET ?', data, function(error, result) {
                            if (!!error) {
                                console.log('TableError', error.sqlMessage)
                                tempDb.rollback(function() {
                                    return res.status(422).send({ 'msg': error.sqlMessage })
                                })
                            } else {
                                restaurant.addressId = result.insertId
                                data = primaryContact
                                data.email = lowerCased(primaryContact.email)
                                data.restaurantId = restaurantId
                                data.hashString = hashString
                                tempDb.query('INSERT INTO users SET ?', data, function(error, result) {
                                    if (!!error) {
                                        console.log('TableError', error.sqlMessage)
                                        tempDb.rollback(function() {
                                            return res.status(422).send({ 'msg': error.sqlMessage })
                                        })
                                    } else {
                                        restaurant.primaryContactId = result.insertId
                                        if (secondaryContact) {
                                            data = secondaryContact
                                            data.email = lowerCased(secondaryContact.email)
                                            data.restaurantId = restaurantId
                                            hashString = Math.random().toString(36).substring(2);
                                            data.hashString = hashString
                                            tempDb.query('INSERT INTO users SET ?', data, function(error, result) {
                                                if (!!error) {
                                                    console.log('TableError', error.sqlMessage)
                                                    tempDb.rollback(function() {
                                                        return res.status(422).send({ 'msg': error.sqlMessage })
                                                    })
                                                } else {
                                                    restaurant.secondaryContactId = result.insertId
                                                    tempDb.query('INSERT INTO restaurants SET ?', restaurant, function(error) {
                                                        if (!!error) {
                                                            console.log('TableError', error.sqlMessage)
                                                            tempDb.rollback(function() {
                                                                return res.status(422).send({ 'msg': error.sqlMessage })
                                                            })
                                                        } else {
                                                            tempDb.commit(function(error) {
                                                                if (error) { 
                                                                    tempDb.rollback(function() {
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
                                            })
                                        } else {
                                            tempDb.query('INSERT INTO restaurants SET ?', restaurant, function(error) {
                                                if (!!error) {
                                                    console.log('TableError', error.sqlMessage)
                                                    tempDb.rollback(function() {
                                                        return res.status(422).send({ 'msg': error.sqlMessage })
                                                    })
                                                } else {
                                                    tempDb.commit(function(error) {
                                                        if (error) { 
                                                            tempDb.rollback(function() {
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
                                })
                            }
                        })
                    })
                }
                else return res.status(401).send({ 'msg': 'Invalid Token!' })
            })
        })
    })

    app.get('/admin/getAllRestaurants', async (req, res) => {
        const adminId = decrypt(req.header('authorization'))
        if (!adminId) return res.status(401).send({ 'msg': 'Not Authorized!' })
        getSecureConnection(
            res,
            adminId,
            `SELECT R.restaurantId, R.restaurantName, R.cuisine,  RA.city, 
            (SELECT COUNT(*) FROM restaurantsQrs RQ WHERE RQ.restaurantId = R.restaurantId) as qrCounts 
            FROM restaurants R 
            JOIN restaurantsAddress RA on RA.restaurantId = R.restaurantId 
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
                            for (var i=0; i<values.length; i++) {
                                query = query + ` ( '${restaurantId}', '${values[i]}' )`
                                if (i !== (values.length - 1))
                                    query = query + ','
                            }
                            tempDb.query(query, function(error) {
                                if (!!error) {
                                    console.log('TableError', error.sqlMessage)
                                    tempDb.rollback(function() {
                                        return res.status(422).send({ 'msg': error.sqlMessage })
                                    })
                                } else {
                                    tempDb.commit(function(error) {
                                        if (error) { 
                                            tempDb.rollback(function() {
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
                    else return res.status(401).send({ 'msg': 'Invalid Token!' })
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
        if (!name) return res.status(422).send({ 'msg': 'Item name is required!' })
        if (!price) return res.status(422).send({ 'msg': 'Item price is required!' })
        if (!categoryId) return res.status(422).send({ 'msg': 'Item category is required!' })
        if (addOns && addOns.length) {
            for (var i=0; i<addOns.length; i++) {
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
                        if (imageUrl)
                            menu.imageUrl = imageUrl
                        if (shortDescription)
                            menu.shortDescription = shortDescription
                        tempDb.query('INSERT INTO menu SET ?', menu, function(error, result) {
                            if (!!error) {
                                console.log('TableError', error.sqlMessage)
                                tempDb.rollback(function() {
                                    return res.status(422).send({ 'msg': error.sqlMessage.includes('Duplicate') ?
                                        "Duplicate entry" : error.sqlMessage.includes('foreign key') ?
                                            "Invalid Category" : "Failed to add Menu Item"
                                    })
                                })
                            } else {
                                if (addOns && addOns.length) {
                                    for (let i=0; i<addOns.length; i++) {
                                        const addOn = {}
                                        addOn.name = addOns[i].name
                                        addOn.menuId = result.insertId
                                        if (addOns[i].price)
                                            addOn.price = addOns[i].price
                                        if (addOns[i].mandatory)
                                            addOn.mandatory = addOns[i].mandatory
                                        tempDb.query('INSERT INTO addOns SET ?', addOn, function(error, result) {
                                            if (!!error) {
                                                console.log('TableError', error.sqlMessage)
                                                tempDb.rollback(function() {
                                                    return res.status(422).send({ 'msg': "Failed to add Add-on" })
                                                })
                                            } else {
                                                if (addOns[i].variations && addOns[i].variations.length) {
                                                    tempDb.query("SET FOREIGN_KEY_CHECKS=0;")
                                                    let query = 'INSERT INTO addOnOptions ( name, addOnID ) VALUES'
                                                    for (var j=0; j<addOns[i].variations.length; j++) {
                                                        query = query + ` ( '${addOns[i].variations[j]}', '${result.insertId}' )`
                                                        if (j !== (addOns[i].variations.length - 1))
                                                            query = query + ','
                                                    }
                                                    tempDb.query(query, function(error) {
                                                        if (!!error) {
                                                            console.log('TableError', error.sqlMessage)
                                                            tempDb.rollback(function() {
                                                                return res.status(422).send({ 'msg': "Failed to add Add-on Options" })
                                                            })
                                                        }
                                                    })
                                                }
                                            }
                                        })
                                    }
                                }
                                tempDb.commit(function(error) {
                                    if (error) { 
                                        tempDb.rollback(function() {
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
                else return res.status(401).send({ 'msg': 'Invalid Token!' })
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
            aoo.id addOnOption_id, aoo.name addOnOption_name 
            FROM menu m 
            LEFT JOIN addOns ao ON ao.menuId = m.id
            LEFT JOIN addOnOptions aoo ON aoo.addOnID = ao.id
            WHERE restaurantId = '${restaurantId}'`,
            { restaurantId, name },
            (data) => {
                if (data.length) {
                    let menu = []
                    for (let i=0; i<data.length; i++) {
                        let addOns = []
                        for (let j=0; j<data.length; j++) {
                            let addOnOptions = []
                            for (let k=0; k<data.length; k++) {
                                if (data[k].addOnOption_id && !includes(addOnOptions, data[k].addOnOption_id) && data[k].addOn_id === data[j].addOn_id) {
                                    addOnOptions.push({
                                        id: data[k].addOnOption_id,
                                        name: data[k].addOnOption_name,
                                    })
                                }
                            }
                            if (data[j].addOn_id && !includes(addOns, data[j].addOn_id)  && data[j].id === data[i].id) {
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
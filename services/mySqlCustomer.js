const mysql = require('mysql')

const { mySQLConfig } = require('../config')

const db = mysql.createPool(mySQLConfig)

exports.getSecureConnection = function (res, token, query, data, callBack, failureCallBack) {
    db.getConnection(function (error, tempDb) {
        if (!!error) {
            console.log('DbConnectionError', error.sqlMessage)
            return res.send({
                status: false,
                message: 'Unable to reach database!',
                errorCode: 503
            })
        }
        else {
            tempDb.query(`SELECT * FROM customers WHERE id = '${token}' AND active = 1`, (error, authResult) => {
                if (authResult && authResult.length) {
                    tempDb.query(query, data, (error, result) => {
                        tempDb.release()
                        return response(error, result, res, callBack, failureCallBack)
                    })
                }
                else return res.send({
                    status: false,
                    message: 'Invalid Session!',
                    errorCode: 401
                })
            })
        }
    })
}

exports.getConnection = function (res, query, data, callBack, failureCallBack) {
    db.getConnection(function (error, tempDb) {
        if (!!error) {
            console.log('DbConnectionError', error)
            return res.send({
                status: false,
                message: 'Unable to reach database!',
                errorCode: 503
            })
        }
        else {
            tempDb.query(query, data, (error, result) => {
                tempDb.release()
                return response(error, result, res, callBack, failureCallBack)
            })
        }
    })
}

exports.getTransactionalConnection = function () {
    return db
}

function response (error, result, res, callBack, failureCallBack) {
    if (!!error) {
        console.log('TableError', error.sqlMessage)
        if (error.sqlMessage.includes('Duplicate') && !!failureCallBack)
            return failureCallBack()
        else return res.send({
            status: false,
            message: error && error.sqlMessage ? error.sqlMessage.includes('Duplicate') ? 'Record already exists' : error.sqlMessage : 'Unknown error at database',
            errorCode: 422
        })
    } else return callBack(result)
}
import { combineEpics } from 'redux-observable'
import { loginEpic } from './admin/loginEpic'
import { forgotPasswordEpic } from './admin/forgotPasswordEpic'
import { createPasswordEpic } from './admin/createPasswordEpic'
import { getAllRestaurantsEpic } from './admin/getAllRestaurantsEpic'
import { addRestaurantEpic } from './admin/addRestaurantEpic'
import { generateQrsEpic } from './admin/generateQrsEpic'
import { getExistingQrsEpic } from './admin/getExistingQrsEpic'
import { setTableNameEpic } from './admin/setTableNameEpic'
import { getSuperAdminDashboardEpic } from './admin/getSuperAdminDashboardEpic'
import { getCategoriesEpic } from './admin/getCategoriesEpic'
import { addCategoryEpic } from './admin/addCategoryEpic'
import { updateCategoryEpic } from './admin/updateCategoryEpic'
import { deleteCategoryEpic } from './admin/deleteCategoryEpic'

export const epics = combineEpics(
    loginEpic.login,
    forgotPasswordEpic.forgotPassword,
    createPasswordEpic.createPassword,
    getAllRestaurantsEpic.getAllRestaurants,
    addRestaurantEpic.addRestaurant,
    generateQrsEpic.generateQrs,
    getExistingQrsEpic.getExistingQrs,
    setTableNameEpic.setTableName,
    getSuperAdminDashboardEpic.getSuperAdminDashboard,
    getCategoriesEpic.getCategories,
    addCategoryEpic.addCategory,
    updateCategoryEpic.updateCategory,
    deleteCategoryEpic.deleteCategory
)

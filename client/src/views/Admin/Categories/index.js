import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'

import { customisedAction } from '../../../redux/actions'
import { ADD_CATEGORY, DELETE_CATEGORY, SET_TOAST, SET_TOAST_DISMISSING, UPDATE_CATEGORY } from '../../../constants'
import { capitalizeFirstLetter } from '../../../helpers'

import { Button, Input } from '../../../components'

import CategoriesList from './CategoriesList'

function Categories() {

  const [categoryName, setcategoryName] = useState('')
  const [selectedCategory, setselectedCategory] = useState(null)

  const fetchingCategories = useSelector(({ categoriesReducer }) => categoriesReducer.fetchingCategories)
  const addingCategory = useSelector(({ categoriesReducer }) => categoriesReducer.addingCategory)
  const updatingCategory = useSelector(({ categoriesReducer }) => categoriesReducer.updatingCategory)
  const deletingCategory = useSelector(({ categoriesReducer }) => categoriesReducer.deletingCategory)
  const categories = useSelector(({ categoriesReducer }) => categoriesReducer.categories)
  const admin = useSelector(({ sessionReducer }) => sessionReducer.admin)
  const dispatch = useDispatch()

  const { restaurantId } = admin

  useEffect(() => {
    if (fetchingCategories) reset()
  }, [fetchingCategories])

  const reset = () => {
    setcategoryName('')
    setselectedCategory(null)
  }

  const isValid = () => {
    if (!categoryName || !categoryName.replaceAll(' ', '').replaceAll('\'', '').replaceAll(',', '').replaceAll('.', '')) {
      dispatch(customisedAction(SET_TOAST_DISMISSING, true))
      dispatch(customisedAction(SET_TOAST, { message: 'Enter a valid category name!', type: 'error'}))
      return false
    } return true
  }

  const addCategory = () => {
    if (isValid())
      dispatch(customisedAction(ADD_CATEGORY, { name: capitalizeFirstLetter(categoryName), restaurantId }))
  }

  const UpdateCategory = () => {
    if (isValid())
      dispatch(customisedAction(UPDATE_CATEGORY, { id: selectedCategory.id, name: capitalizeFirstLetter(categoryName), restaurantId }))
  }

  const onSelect = (category) => {
    setselectedCategory(category)
    setcategoryName(category.name)
  }

  const onDelete = (id) => {
    dispatch(customisedAction(DELETE_CATEGORY, { id, restaurantId }))
  }

  return (
    <div className="Container">
      <h2>Categories Management</h2>
      <div className="TopOptionsContainer">
        <div className="TopInputContainer">
          <Input 
            placeholder="Enter New Category Name"
            value={categoryName}
            onChange={({ target: { value } }) => setcategoryName(value)}
          />
        </div>
        <div className="TopButtonContainer" style={{ justifyContent: 'flex-start' }}>
          {selectedCategory ?
            <Button
              text="Update Category"
              light={fetchingCategories || addingCategory || updatingCategory || deletingCategory}
              lightAction={() => null}
              iconLeft={<i className="fa fa-check-circle" />}
              onClick={() => UpdateCategory()} />
            :  <Button
                text="Add Category"
                light={fetchingCategories || addingCategory || updatingCategory || deletingCategory}
                lightAction={() => null}
                iconLeft={<i className="fa fa-plus-circle" />}
                onClick={() => addCategory()} />
          }
        </div>
      </div>
      {fetchingCategories && !categories ?
        <div className="loadingContainer">
          <p><i className={`fa fa-refresh ${fetchingCategories ? 'fa-pulse' : ''}`} style={{ padding: '0px 5px' }} />Fetching / Syncing Categories . . .</p>
        </div> : null
      }
      <CategoriesList 
        onSelect={onSelect}
        onDelete={onDelete}
        reset={reset}
        selectedCategory={selectedCategory}
        categories={categories} />
    </div>
  )
}

export default Categories

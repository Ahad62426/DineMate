import React from 'react'
import { useDispatch } from 'react-redux'

import { customisedAction } from '../../../redux/actions'
import { RESTAURANT_CHANGED } from '../../../constants'

import { SmallButton } from '../../../components'

function AddRestaurants(props) {
  return (
    <div className="Container">
      <h2>Add Restaurants</h2>
    </div>
  )
}

export default AddRestaurants
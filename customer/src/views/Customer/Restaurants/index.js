import React, { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'

import ResturantListComponent from '../../../components/ResturantListComponent'
import { Title } from '../../../components/Title'
import { GET_ALL_RESTAURANTS, SEARCH_RESTURANT } from '../../../constants'
import { customisedAction } from '../../../redux/actions'
import './styles.css'

function Restaurants(props) {

  const fetchingRestaurants = useSelector(({ restaurantsReducer }) => restaurantsReducer.fetchingRestaurants)
  const allRestaurants = useSelector(({ restaurantsReducer }) => restaurantsReducer.restaurants)
  const searchResturant = useSelector(({ serachResturantReducer }) => serachResturantReducer.restaurants)
  const [resturants, setResturants] = useState([])
  const dispatch = useDispatch()

  useEffect(() => {
  }, [])

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    let value = urlParams.get("value")
    console.log(value)
    if (value) {
      let obj = {
        "searchBy": value
      }
      dispatch(customisedAction(SEARCH_RESTURANT, obj))
      // setResturants(searchResturant)
      // console.log(value)
    } else {
      dispatch(customisedAction(GET_ALL_RESTAURANTS))
      // setResturants(allRestaurants)

    }
  }, [window.location.search])

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    let value = urlParams.get("value")
    console.log(value)
    if (value) {
      setResturants(searchResturant)
      console.log(searchResturant)
    } else {
      setResturants(allRestaurants)
      console.log(allRestaurants)

    }
  }, [window.location.search,searchResturant,allRestaurants])

  return (
    <div>
      <div className="image_holder">
        <img src={require("../../../assets/bgimage.png").default} style={{ width: '100%', marginTop: -60 }} />
      </div>



      <div className="heading-container">
        <Title text="All Restaurants" />
      </div>
      <div className="resturant-list-container">
        {resturants && resturants.length ?
          resturants.map((restaurant, index) => {
            const { restaurantId, imageUrl, restaurantName: name, categories, rating } = restaurant
            const imagesArray = [require("../../../assets/listingbg.png"), require("../../../assets/bgimage.png")]
            return (
              <div key={index} className="resturant-list-component">
                <ResturantListComponent
                  title={name}
                  price={"$$"}
                  cuisines={categories && categories.length ? categories.map((category, index) => {
                    return `${category.name}${index !== (categories.length - 1) ? ' • ' : ''}`
                  }) : null}
                  stars={rating}
                  image={imageUrl || imagesArray[index % 2].default}
                  onClick={() => props.history.push(`/customer/${restaurantId}/menu`)}
                />
              </div>)
          })
          : null
        }
      </div>




      <div style={{ display: 'flex', justifyContent: 'center', }} className="button-container-resturant">
        <button className="resturant-button">Show More</button>
      </div>
    </div>
  )
}

export default Restaurants

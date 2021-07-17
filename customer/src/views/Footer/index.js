import React from 'react'
import { useRouteMatch, withRouter } from 'react-router-dom'
import { Logo } from '../../components'

import './styles.css'

const Footer = props => {
    // const match = useRouteMatch('/:restaurantId/:tableId');
    // console.log(match)
    return  (
        <div className="global-footer">
            <div className="global-footer-inner">

                <div className="global-footer-top">
                    <div className="footer-top-left">
                        <div className="footer-top-left-top">
                            <Logo style={{ marginLeft: 0 }} src={require('../../assets/logo.png').default} />
                        </div>
                        {props && props.location && props.location.pathname !== '/' ?
                            <div className="footer-top-left-bottom">
                                <div className="footer-top-left-bottom-img" style={{ marginRight: '2vw' }}>
                                    <img src={require("../../assets/apple.png").default} />
                                </div>
                                <div className="footer-top-left-bottom-img">
                                    <img src={require("../../assets/google.png").default} />
                                </div>
                            </div>
                            : null}
                    </div>
                    <div className="footer-top-right">
                        <div className="ftr-left">
                            <p>
                                About Dine Mate
                            </p>
                            <p>
                                Read our blog
                            </p>
                            <p onClick={() => props.history.push('/registration')}>
                                Add your restaurant
                            </p>
                            <p onClick={() => {
                                const win = window.open("/client", "_blank")
                                win.focus()
                            }}>
                                Sign in to deliver
                            </p>
                        </div>
                        <div className="ftr-right">
                            <p onClick={() => null}>
                                Get Help
                            </p>
                            <p>
                                View all cities
                            </p>
                            <p onClick={() => props.history.push('/customer/restaurants')}>
                                Restaurants near me
                            </p>
                        </div>
                    </div>
                </div>
                <div className="global-footer-bottom">
                    <div className="footer-bottom-left">
                        <p> © 2021 Dine Mate. All Rights Are Reserved.</p>
                    </div>
                    <div className="footer-bottom-right">
                        <div className="footer-bottom-right-logo">
                            <img src={require("../../assets/fblogo.png").default} />
                        </div>
                        <div className="footer-bottom-right-logo">
                            <img src={require("../../assets/instagramlogo.png").default} />
                        </div>
                    </div>
                </div>

            </div>

        </div>
    )
}





export default withRouter(Footer)
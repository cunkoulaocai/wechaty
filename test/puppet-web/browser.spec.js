import fs from 'fs'
import { test } from 'ava'

import {
  PuppetWeb
  , Config
  , log
} from '../../'

const Browser = PuppetWeb.Browser
const PROFILE = Config.DEFAULT_PROFILE + '-' + process.pid + '-'
let profileCounter = 1

test('Browser class cookie smoking tests', async t => {
  const b = new Browser()
  t.truthy(b, 'should instanciate a browser instance')

  b.targetState('open')
  await b.initDriver()
  t.pass('should init driver')

  await b.open()
  t.pass('should opened')

  const two = await b.execute('return 1+1')
  t.is(two, 2, 'should got 2 after execute script 1+1')

  let cookies = await b.driver.manage().getCookies()
  t.truthy(cookies.length, 'should got plenty of cookies')

  await b.driver.manage().deleteAllCookies()
  cookies = await b.driver.manage().getCookies()
  t.is(cookies.length, 0, 'should no cookie anymore after deleteAllCookies()')

  const EXPECTED_COOKIES = [{
    name: 'wechaty0'
    , value: '8788-0'
    , path: '/'
    , domain: '.qq.com'
    , secure: false
    , expiry: 99999999999999
  }
  , {
    name: 'wechaty1'
    , value: '8788-1'
    , path: '/'
    , domain: '.qq.com'
    , secure: false
    , expiry: 99999999999999
  }]

  await Promise.all(b.addCookies(EXPECTED_COOKIES))

  cookies = await b.driver.manage().getCookies()
  const cookies0 = cookies.filter(c => { return RegExp(EXPECTED_COOKIES[0].name).test(c.name) })
  t.is(cookies0[0].name, EXPECTED_COOKIES[0].name, 'getCookies() should filter out the cookie named wechaty0')
  const cookies1 = cookies.filter(c => { return RegExp(EXPECTED_COOKIES[1].name).test(c.name) })
  t.truthy(cookies1, 'should get cookies1')
  t.is(cookies1[0].name, EXPECTED_COOKIES[1].name, 'getCookies() should filter out the cookie named wechaty1')

  await b.open()
  t.pass('re-opened url')
  const cookieAfterOpen = await b.driver.manage().getCookie(EXPECTED_COOKIES[0].name)
  t.is(cookieAfterOpen.name, EXPECTED_COOKIES[0].name, 'getCookie() should get expected cookie named after re-open url')

  const dead = b.dead()
  t.is(dead, false, 'should be a not dead browser')

  const live = await b.readyLive()
  t.is(live, true, 'should be a live browser')

  await b.quit()
})

test('Browser session save before quit, and load after restart', async t => {
  const profileName = PROFILE + profileCounter++ 
  let b
  
  /**
   * use exception to call b.quit() to clean up
   */
  try {
    b = new Browser({
      sessionFile: profileName
    })
    t.truthy(b, 'new Browser')

    b.targetState('open')

    await b.initDriver()
    t.pass('should init driver')

    await b.open()
    t.pass('opened')

    const EXPECTED_COOKIE = {
      name: 'wechaty_save_to_session'
      , value: '### This cookie should be saved to session file, and load back at next PuppetWeb init  ###'
      , path: '/'
      , domain: '.wx.qq.com'
      , secure: false
      , expiry: 99999999999999
    }
    const EXPECTED_NAME_REGEX = new RegExp('^' + EXPECTED_COOKIE.name + '$')

    await b.driver.manage().deleteAllCookies()
    let cookies = await b.driver.manage().getCookies()
    t.is(cookies.length, 0, 'should no cookie after deleteAllCookies()')

    await b.addCookies(EXPECTED_COOKIE)
    const cookieFromBrowser = await b.driver.manage().getCookie(EXPECTED_COOKIE.name)
    t.is(cookieFromBrowser.name, EXPECTED_COOKIE.name, 'cookie from getCookie() should be same as we just set')

    let cookiesFromCheck = await b.checkSession()
    t.truthy(cookiesFromCheck.length, 'should get cookies from checkSession() after addCookies()')
    let cookieFromCheck  = cookiesFromCheck.filter(c => EXPECTED_NAME_REGEX.test(c.name))
    t.is(cookieFromCheck[0].name, EXPECTED_COOKIE.name, 'cookie from checkSession() return should be same as we just set by addCookies()')

    const cookiesFromSave = await b.saveSession()
    t.truthy(cookiesFromSave.length, 'should get cookies from saveSession()')
    const cookieFromSave  = cookiesFromSave.filter(c => EXPECTED_NAME_REGEX.test(c.name))
    t.is(cookieFromSave.length, 1, 'should has the cookie we just set')
    t.is(cookieFromSave[0].name, EXPECTED_COOKIE.name, 'cookie from saveSession() return should be same as we just set')

    await b.driver.manage().deleteAllCookies()
    cookiesFromCheck = await b.checkSession()
    t.is(cookiesFromCheck.length, 0, 'should no cookie from checkSession() after deleteAllCookies()')

    const cookiesFromLoad = await b.loadSession().catch(() => {}) // fail safe
    t.truthy(cookiesFromLoad.length, 'should get cookies after loadSession()')
    const cookieFromLoad = cookiesFromLoad.filter(c => EXPECTED_NAME_REGEX.test(c.name))
    t.is(cookieFromLoad[0].name, EXPECTED_COOKIE.name, 'cookie from loadSession() should has expected cookie')

    cookiesFromCheck = await b.checkSession()
    t.truthy(cookiesFromCheck.length, 'should get cookies from checkSession() after loadSession()')
    cookieFromCheck  = cookiesFromCheck.filter(c => EXPECTED_NAME_REGEX.test(c.name))
    t.truthy(cookieFromCheck.length, 'should has cookie after filtered after loadSession()')
    t.is(cookieFromCheck[0].name, EXPECTED_COOKIE.name, 'cookie from checkSession() return should has expected cookie after loadSession')

    await b.quit()
    t.pass('quited')

    /**
     * start new browser process
     * with the same sessionFile: profileName
     */

    b = new Browser({
      sessionFile: profileName
    })
    t.pass('should started a new Browser')

    b.targetState('open')

    await b.initDriver()
    t.pass('should inited the new Browser')
    await b.open()
    t.pass('should opened')

    await b.loadSession()
    t.pass('should loadSession for new Browser(process)')

    const cookieAfterQuit = await b.driver.manage().getCookie(EXPECTED_COOKIE.name)
    t.truthy(cookieAfterQuit, 'should get cookie from getCookie()')
    t.is(cookieAfterQuit.name, EXPECTED_COOKIE.name, 'cookie from getCookie() after browser quit, should load the right cookie back')

    // clean
    fs.unlink(profileName, err => {
      if (err) {
        log.warn('Browser', 'unlink session file %s fail: %s', PROFILE, err)
      }
    })

    await b.quit()
  } catch (e) {
    if (b) {
      await b.quit()
    }
    t.fail('exception: ' + e.message)
  }
})

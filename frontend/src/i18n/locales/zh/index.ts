import landing from './landing'
import common from './common'
import dashboard from './dashboard'
import batchImage from './batchImage'
import admin from './admin'
import misc from './misc'
import userGroups from './userGroups'

export default {
  ...landing,
  ...common,
  ...dashboard,
  ...batchImage,
  admin,
  ...userGroups,
  ...misc,
}

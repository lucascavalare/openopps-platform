var _ = require('underscore');
var Backbone = require('backbone');
var $ = require('jquery');

var NavView = require('./apps/nav/views/nav_view');
var FooterView = require('./apps/footer/views/footer_view');
var ProfileHomeController = require('./apps/profiles/home/controllers/home_controller');
var ProfileShowController = require('./apps/profiles/show/controllers/profile_show_controller');
var ProfileEditController = require('./apps/profiles/edit/controllers/profile_edit_controller');
var ProfileListController = require('./apps/profiles/list/controllers/profile_list_controller');
var ProfileFindController = require('./apps/profiles/find/controllers/profile_find_controller');
var TaskModel = require('./entities/tasks/task_model');
var TaskCollection = require('./entities/tasks/tasks_collection');
var TaskListController = require('./apps/tasks/list/controllers/task_list_controller');
var TaskShowController = require('./apps/tasks/show/controllers/task_show_controller');
var TaskEditFormView = require('./apps/tasks/edit/views/task_edit_form_view');
var AdminMainController = require('./apps/admin/controllers/admin_main_controller');
var HomeController = require('./apps/home/controllers/home_controller');
var ApplyController = require('./apps/apply/controllers/apply_controller');
var LoginController = require('./apps/login/controllers/login_controller');
var Modal = require('./components/modal');

var BrowseRouter = Backbone.Router.extend({

  routes: {
    ''                              : 'showLanding',
    'home'                          : 'showHome',
    'tasks/new(?*queryString)'      : 'newTask',
    'tasks(/)(?:queryStr)'          : 'listTasks',
    'tasks/:id(/)'                  : 'showTask',
    'tasks/:id/:action(/)'          : 'showTask',
    'profiles(/)(?:queryStr)'       : 'listProfiles',
    'profile/find(/)'               : 'findProfile',
    'profile/link(/)'               : 'linkProfile',
    'profile/:id(/)'                : 'showProfile',
    'profile/edit/skills/:id(/)'    : 'editSkills',
    'profile/edit/:id(/)'           : 'editProfile',
    'admin(/)'                      : 'showAdmin',
    'admin(/):action(/)(:agencyId)' : 'showAdmin',
    'login(/)'                      : 'showLogin',
    'apply'                         : 'showApply',
    'unauthorized(/)'               : 'showUnauthorized',
    'expired(/)'                    : 'showExpired',
  },

  data: { saved: false },

  initialize: function () {

    this.navView = new NavView({
      el: '.navigation',
    }).render();

    this.footerView = new FooterView({
      el: '#footer',
    }).render();

    // set navigation state
    this.on('route', function (route, params) {
      var href = window.location.pathname;
      $('.navigation .nav-link')
        .closest('li')
        .removeClass('active');
      $('.navigation .nav-link[href="' + href + '"]')
        .closest('li')
        .addClass('active');
      $.getJSON('/csrfToken', function (t) {
        window.cache.userEvents.trigger('idle:reset');
        $('meta[name="csrf-token"]').attr('content', t._csrf);
        $.ajaxPrefilter(function (options, originalOptions, jqXHR) {
          var token;
          token = $('meta[name="csrf-token"]').attr('content');
          if (token) {
            return jqXHR.setRequestHeader('X-CSRF-Token', token);
          }
        });
      });
    });
  },

  cleanupChildren: function () {
    if (this.browseListController) { this.browseListController.cleanup(); }
    if (this.profileShowController) { this.profileShowController.cleanup(); }
    if (this.profileFindController) { this.profileFindController.cleanup(); }
    if (this.profileEditController) { this.profileEditController.cleanup(); }
    if (this.taskShowController) { this.taskShowController.cleanup(); }
    if (this.taskCreateController) { this.taskCreateController.cleanup(); }
    if (this.homeController) { this.homeController.cleanup(); }
    if (this.loginController) { this.loginController.cleanup(); }
    this.data = { saved: false };
  },

  showLanding: function () {
    this.cleanupChildren();
    this.homeController = new HomeController({
      target: 'home',
      el: '#container',
      router: this,
      data: this.data,
    });
  },

  showLogin: function () {
    if(loginGov) {
      window.location = '/api/auth/oidc' + location.search;
    } else {
      this.cleanupChildren();
      this.loginController = new LoginController({
        target: 'login',
        el: '#container',
        router: this,
        data: this.data,
      });
    }
  },

  showUnauthorized: function () {
    Backbone.history.navigate('/', { replace: true });
    this.navView = new NavView({
      el: '.navigation',
      accessForbidden: true, 
    }).render();
    var UnauthorizedTemplate = require('./apps/login/templates/unauthorized.html');
    $('#container').html(_.template(UnauthorizedTemplate)());
    $('#search-results-loading').hide();
    $('.usa-footer-return-to-top').hide();
  },

  showExpired: function () {
    Backbone.history.navigate('/', { replace: true });
    this.navView = new NavView({
      el: '.navigation', 
    }).render();
    var ExpiredTemplate = require('./apps/login/templates/expired.html');
    $('#container').html(_.template(ExpiredTemplate)());
    $('#search-results-loading').hide();
    $('.usa-footer-return-to-top').hide();
  },

  parseQueryParams: function (str) {
    var params = {};
    if (str) {
      var terms = str.split('&');
      for (var i = 0; i < terms.length; i++) {
        var nameValue = terms[i].split('=');
        if (nameValue.length == 2) {
          params[nameValue[0]] = nameValue[1];
        } else {
          params[terms[i]] = '';
        }
      }
    }
    return params;
  },

  listTasks: function (queryStr) {
    this.cleanupChildren();
    this.taskListController = new TaskListController({
      el: '#container',
      router: this,
      queryParams: this.parseQueryParams(queryStr),
      data: this.data,
    });
  },

  listProfiles: function (queryStr) {
    if (!window.cache.currentUser) {
      Backbone.history.navigate('/login?profiles', { trigger: true });
    } else {
      this.cleanupChildren();
      this.profileListController = new ProfileListController({
        el: '#container',
        router: this,
        queryParams: this.parseQueryParams(queryStr),
        data: this.data,
      });
    }
  },

  showTask: function (id, action) {
    this.cleanupChildren();
    var model = new TaskModel();
    model.set({ id: id });
    this.taskShowController = new TaskShowController({ model: model, router: this, id: id, action: action, data: this.data });
  },

  /*
   * Create a new task. This method first populates and generates a new collection
   * with a single empty model. It also creates a new TaskCreationForm adding the
   * collection to it. This collection is then managed by the view using events
   * on the collection.
   */
  newTask: function ( /*params*/ ) {
    if (!window.cache.currentUser) {
      Backbone.history.navigate('/login?tasks/new', { trigger: true });
      return;
    }
    var self = this;
    this.cleanupChildren();
    var model = new TaskModel();
    var restrict = _.pick(window.cache.currentUser.agency, 'name', 'abbr', 'parentAbbr', 'domain', 'slug');
    model.set('restrict', _.defaults(restrict, model.get('restrict')));
    model.tagTypes(function (tagTypes) {
      this.taskEditFormView = new TaskEditFormView({
        el: '#container',
        edit: false,
        model: model,
        tags: [],
        madlibTags: {},
        tagTypes: tagTypes,
      }).render();
    });

    this.listenTo(model, 'task:save:success', function (data) {
      Backbone.history.navigate('/tasks/' + data.attributes.id, { trigger: true });
      if(data.attributes.state != 'draft') {
        setTimeout(function () {
          $('body').addClass('modal-is-open');
          this.modal = new Modal({
            el: '#site-modal',
            id: 'submit-opp',
            modalTitle: 'Submitted',
            modalBody: 'Thanks for submitting the <strong>' + data.attributes.title + '</strong>. We\'ll review it and let you know if it\'s approved or if we need more information.',
            primary: {
              text: 'Close',
              action: function () {
                this.modal.cleanup();
              }.bind(this),
            },
          }).render();
        }, 500);
      }
    });

    this.listenTo(model, 'task:save:error', function (model, response, options) {
      var error = options.xhr.responseJSON;
      if (error && error.invalidAttributes) {
        for (var item in error.invalidAttributes) {
          if (error.invalidAttributes[item]) {
            message = _(error.invalidAttributes[item]).pluck('message').join(',<br /> ');
            $('#' + item + '-update-alert').html(message).show();
          }
        }
      } else if (error) {
        var alertText = response.statusText + '. Please try again.';
        $('.alert.alert-danger').text(alertText).show();
        $(window).animate({ scrollTop: 0 }, 500);
      }
    });
  },

  showHome: function (id) {
    this.cleanupChildren();
    if (id) {
      id = id.toLowerCase();
    }
    this.profileHomeController = new ProfileHomeController({
      target: 'home',
      el: '#container',
      router: this,
      data: this.data,
    });
  },

  showApply: function () {
    this.cleanupChildren();
    // if (id) {
    //   id = id.toLowerCase();
    // }
    this.applyController = new ApplyController({
      target: 'apply',
      el: '#container',
      router: this,
      data: this.data,
    });
  },
  
  findProfile: function () {
    this.cleanupChildren();
    this.profileFindController = new ProfileFindController({
      target: 'profile/find',
      el: '#container',
      router: this,
    });
  },

  editSkills: function (id) {
    this.cleanupChildren();
    this.profileEditController = new ProfileEditController({ id: id, action: 'skills', data: this.data });
    
  },

  editProfile: function (id) {
    this.cleanupChildren();
    this.profileEditController = new ProfileEditController({ id: id,  action: 'edit', data: this.data });
  },

  showProfile: function (id) {
    this.cleanupChildren();
    this.profileShowController = new ProfileShowController({ id: id, data: this.data });
  },

  showAdmin: function (action, agencyId) {
    if (!window.cache.currentUser) {
      Backbone.history.navigate('/login?admin', { trigger: true });
    } else {
      this.cleanupChildren();
      this.adminMainController = new AdminMainController({
        el: '#container',
        action: action,
        agencyId: agencyId,
      });
    }
  },

});

var initialize = function () {
  var router = new BrowseRouter();
  return router;
};

module.exports = {
  initialize: initialize,
};

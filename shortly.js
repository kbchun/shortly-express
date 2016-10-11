var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var bcrypt = require('bcrypt-nodejs');
var passport = require('passport');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(session({
  secret: 'hackreactor1',
  saveUninitialized: true,
  resave: false
}));


// GitHub Auhentication
var GithubStrategy = require('passport-github').Strategy;

passport.use(new GithubStrategy({
  clientID: 'd0067a81fb03564038fa',
  clientSecret: 'f021e39942f16193866492af1ccccf4fb2afd6d9',
  callbackURL: 'http://127.0.0.1:4568/auth/github/callback'
},
  function(accessToken, refreshToken, profile, done) {
    return done(null, profile);
  }
));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});


// ROUTES

app.get('/auth/github', passport.authenticate('github'));

app.get('/auth/github/callback', passport.authenticate('github', { failureRedirect: '/' }),
  function(req, res) {
    res.redirect('/');
  }
);

app.get('/login',
function(req, res) {
  if (req.session.user) {
    res.redirect('/');
  } else {
    res.render('login');
  }
});

app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.get('/', util.checkLogIn,
function(req, res) {
  res.render('index');
});

app.get('/create', util.checkLogIn,
function(req, res) {
  res.render('index');
});

// app.get('/links', util.checkLogIn,
// function(req, res) {
//   Links.reset().fetch().then(function(links) {
//     res.status(200).send(links.models);
//   });
// });

app.get('/links', util.checkLogIn,
function(req, res) {
  new User({username: req.session.user}).fetch()
    .then(function(found) {
      Links.reset().fetch().then(function(links) {
        res.status(200).send(links.where({ userid: found.id + ''}));
      });
    });
});

app.post('/links',
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    util.getUrlTitle(uri, function(err, title) {
      if (err) {
        console.log('Error reading URL heading: ', err);
        return res.sendStatus(404);
      }

      new User({username: req.session.user}).fetch().then(function(found) {
        if (found) {
          Links.create({
            url: uri,
            title: title,
            baseUrl: req.headers.origin,
            userid: found.id
          })
          .then(function(newLink) {
            res.status(200).send(newLink);
          });
        }
      });
    });
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.post('/signup', function(req, res) {
  var username = req.body.username;
  var password = bcrypt.hashSync(req.body.password, null, null, function(err, hash) {
    return hash;
  });

  new User({
    username: username
  }).fetch().then(function(found) {
    if (found) {
      res.render('signup-err');
    } else {
      Users.create({
        username: username,
        password: password
      })
      .then(function(success) {
        req.session.user = username;
        res.redirect('/');
      });
    }
  });
});

app.post('/login', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  new User({
    username: username,
  }).fetch().then(function(userEntry) {
    if (userEntry) {
      bcrypt.compare(password, userEntry.get('password'), function(err, result) {
        if (result) {
          req.session.user = username;
          res.redirect('/');
        } else {
          res.render('login-err');
        }
      });
    } else {
      res.render('login-err');
    }
  });
});

app.get('/logout',
function(req, res) {
  req.session.destroy();
  req.logout();
  res.redirect('/');
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);

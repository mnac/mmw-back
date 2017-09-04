var db = require('../config/database/index.js').db;
var dynamo = require('../config/database/index.js').dynamo;
var bcrypt = require('bcryptjs')
var IsEmail = require('isemail');
var redis = require('../config/database/index.js').redis;

const PASSWORD_MIN_LENGTH = 5;

console.log(`initUserStart---------------------`);

function validCredentials(email, password, result){
  findUserByEmail(email, function(error, user){
    if (error) {
      return result(false);
    } else {
      comparePassword(password, user.password, function(isEqual){
          console.log(`isEqual = ${isEqual}`);
          return result(isEqual, user.uuid);
      });
    }
  });
}

function saveToken(email, token, result) {
  findUserByEmail(email, function(error, user){
    if (user) {
      // remove old token reference from redis
      let oldToken = user.token;
      console.log(`Token to remove ${oldToken}`);
      if (oldToken !== null) {
        redis.del(oldToken, function(err, response) {
          if (error){
            console.log("Cannot delete old token: " + err)
            return result(err, false);
          } else {
            console.log("old token deleted Successfully!")
            return validNewToken(email, token, result);
          }
        });
      } else {
        return validNewToken(email, token, result);
      }
    }
  })
}

function saveFollower(userId, followerId, result){
  var params = {
    TableName: 'follower',
    Item: {
      "userId": userId,
      "followerId": followerId
    }
  };
  dynamo.put(params, result);
}

function removeFollower(userId, followerId, result){
  var params = {
    TableName: 'follower',
    Key: {
      "userId": userId,
      "followerId": followerId
    }
  };
  dynamo.delete(params, result);
}

function validNewToken(email, token, result) {
  db(`update users set token=? where email=?;`, [token, email], function(error, rows){
    if (error) {
      console.log(error);
      return result(error, false);
    } else {
      redis.set(token, email, function(err, response) {
        console.log("Save cached token:" + token);
        if (response) {
          console.log("Token saved");
          return result(null, true);
        } else {
          console.log("Token error on saving");
          return result(err, false);
        }
      });
    }
  });
}

function findUserByEmail(email, result){
  db(`select * from users where email=?;`, email, function(error, rows){
    if (error) {
      console.log(error);
      return result(error, null);
    } else if (rows.length == 0) {
      console.log(`User do not exist`);
      return result("User not find", null);
    } else {
      console.log(rows[0]);
      return result(error, rows[0]);
    }
  });
};

function findUserPromise(uuid) {
  return new Promise(function(resolve, reject) {
    console.log("user uuid:" + uuid);
    db(`select uuid, first_name, last_name, profile_picture from users where uuid=?;`, uuid, function(error, rows){
      if (error) {
        console.log(error);
        reject(error);
      } else if (rows.length == 0) {
        console.log(`User do not exist`);
        reject(new Error("Do not exist"));
      } else {
        console.log(rows[0]);
        resolve(rows[0]);
      }
    });
  });
}

function findUserById(uuid){
  return new Promise(function(resolve, reject) {
    db(`select first_name, last_name, gender, birthday, profile_picture from users where uuid=?;`, uuid, function(error, rows){
      if (error) {
        console.log(error);
        reject(error);
      } else if (rows.length == 0) {
        console.log(`User do not exist`);
        reject(new Error("Do not exist"));
      } else {
        console.log(rows[0]);
        resolve(rows[0]);
      }
    });
  });
};

function cryptPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(candidatePassword, encryptedPassword, result) {
  bcrypt.compare(candidatePassword, encryptedPassword, function(err, isMatch){
    if (err){
      console.log(`comparePassword error : ${error}`);
      return result(false);
    } else {
      console.log(`comparePassword matching : ${isMatch}`);
      return result(isMatch);
    }
  });
}

function init(server){
  console.log(`initUser---------------------`);

  server.post("/follow", function(request, response, next) {
    if (!request.clientId) return response.sendUnauthenticated();

    let userId = request.header("userId", "");
    if (typeof userId === 'undefined' || userId == null || !userId.trim()) {
      response.send(422, `userId is not associated`);
      next();
      return;
    }

    let followerId = request.params.followerId;
    if (typeof followerId === 'undefined' || followerId == null || !followerId.trim()) {
      response.send(422, `followerId is not associated`);
      next();
      return;
    }

    if (followerId === userId) {
      response.send(422, `Vous ne pouvez pas vous suivre`);
      next();
      return;
    }

    saveFollower(userId, followerId, function(err, result) {
      if (err) {
        response.send(500, `Une erreur est survenue sur nos serveurs`);
      } else {
        response.send(200);
        next()
      }
    });

  });

  server.post("/unfollow", function(request, response, next) {
    if (!request.clientId) return response.sendUnauthenticated();

    let userId = request.header("userId", "");
    if (typeof userId === 'undefined' || userId == null || !userId.trim()) {
      response.send(422, `userId is not associated`);
      next();
      return;
    }

    let followerId = request.params.followerId;
    if (typeof followerId === 'undefined' || followerId == null || !followerId.trim()) {
      response.send(422, `followerId is not associated`);
      next();
      return;
    }

    removeFollower(userId, followerId, function(err, result) {
      if (err) {
        response.send(500, `Une erreur est survenue sur nos serveurs`);
      } else {
        response.send(200);
        next()
      }
    });

  });

  server.get("/user/:uuid", function(request, response, next){
    if (!request.clientId) return response.sendUnauthenticated();

    let uuid = request.params.uuid;
    if (uuid == undefined || uuid === "") {
      console.log(`user uuid not available`);
      return response.send(422, `Reférence de l'utilisateur non définie`);
    } else {
      db(`select uuid, first_name, last_name, pseudo, email from users where uuid=?;`, uuid, function(error, users){
        if (error) {
          console.log(error);
        } else if (users.length == 0) {
          console.log("No user found!");
          response.send(404, `L'utilisateur n'existe pas`);
        } else {
          console.log(users);
          response.json(users[0]);
        }
      });
    }
    next();
  });

  server.post("/push", function(request, response, next){
      let userUuid = request.header("userId", "");
      if (typeof userUuid === 'undefined' || userUuid == null || !userUuid.trim()) {
        response.send(422, `No user uuid associated`);
        next();
        return;
      }

      let pushToken = request.params.token;
      if (typeof pushToken === 'undefined' || pushToken == null || !pushToken.trim()) {
        response.send(422, `No token associated`);
        next();
        return;
      }

      redis.set(userUuid, pushToken, function(err, result) {
        console.log("Save push token:" + pushToken);
        if (response) {
          console.log("push token saved");
          response.send(200);
        } else {
          console.log("Push Token error on saving", err);
          response.send(500, "Une erreur s'est produite");
        }
      });
  });

  server.put("/user", function(request, response, next) {
    if (!request.clientId) return response.sendUnauthenticated();
    let user = request.params.user;

    console.log("ClientId: ")
    console.log(request.clientId);

    if (request.clientId !== user.email) {
      response.send(403, `Vous ne pouvez pas mettre à jour ce profile`);
      next();
    }

    let values = [user.firstName, user.lastName, user.pseudo, user.gender, user.birthday, user.pictureProfile, user.description, user.uuid];
    let sql = `update users set first_name=?, last_name=?, pseudo=?, gender=?, birthday=?, profile_picture=?, description=? where uuid=?;`;

    db(sql, values, function(error, result){
      if (error) {
        console.log("update failed");
        console.log(error);
        response.send(503, error);
        next();
      } else {
        console.log("User updated");
        response.send(200);
        next();
      }
    });
  });

  server.post("/user/register", function(request, response, next){
    let email = request.params.email;
    let password = request.params.password;

    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);

    if (typeof email === 'undefined' || email == null || !email.trim()) {
      response.send(422, `Le champ email est obligatoire`);
      next();
    } else if (typeof password === 'undefined' || password == null || !password.trim()) {
      response.send(422, `Le champ mot de passe est obligatoire`);
      next();
    } else if (!IsEmail.validate(email)) {
      response.send(422, `Le champ email n'est pas valid`);
      next();
    } else if (password.length < PASSWORD_MIN_LENGTH) {
      response.send(422, `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`);
      next();
    } else {
      let values = [email.trim()];
      console.log("email trimed:" + values);
      db(`select uuid from users where email=?;`, values, function(error, rows){
        if (error) {
          console.log(error);
          response.send(503);
          next();
        } else if (rows.length > 0) {
          console.log(`Email ${email} already exist`);
          response.send(409, `L'email ${email} est déjà utilisé.`);
          next();
        } else {
          console.log("user do not exist can be created.");
          let bCryptPassword = cryptPassword(password);
          console.log("bCryptPassword: " + bCryptPassword);
          let firstName = (typeof request.params.first_name === 'undefined') ? null : request.params.first_name;
          console.log("firstName: " + firstName);
          let lastName = (typeof request.params.last_name === 'undefined') ? null : request.params.last_name;
          console.log("lastName: " + lastName);
          let pseudo = (typeof request.params.pseudo === 'undefined') ? null : request.params.pseudo;
          console.log("pseudo: " + pseudo);

          let registratedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
          console.log("registratedAt: " + registratedAt);

          let values = [email, bCryptPassword, firstName, lastName, pseudo, registratedAt];

          console.log("user values: " + values);

          let sql = `insert into users (id, email, password, first_name, last_name, pseudo, registered_at) values (unhex(replace(uuid(),'-','')),?,?,?,?,?,?);`;
          console.log("sql: " + sql);
          db(sql, values, function(error, result){
            if (error) {
              console.log("registation failed");
              console.log(error);
              response.send(503, error);
              next();
            } else {
              console.log("User registered");
              response.send(200);
              next();
            }
          });
        }
      });
    }
  });
};

module.exports = {
  init,
  findUserPromise,
  findUserById,
  findUserByEmail,
  validCredentials,
  saveToken
};

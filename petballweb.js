angular.module("petBallWeb", ["ngMaterial"])
  .controller("PetBallWebController", function($scope, $rootScope) {
    $scope.firebase = firebase;

    firebase.auth().onAuthStateChanged(function(user) {
      $scope.$apply();
    });

    $scope.signIn = function() {
      if ($scope.email && $scope.password) {
        firebase.auth().signInWithEmailAndPassword($scope.email, $scope.password).then(function(result) {
          console.log("Signed in!");
          console.debug(result);
        }, function(error) {
          console.log("Error");
          console.debug(error);
        })
      }
    };
  })
